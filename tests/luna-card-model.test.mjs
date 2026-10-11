// LUNA panel card mapping, tested on real captured payloads (docs/luna-samples/).
// Run: node --test 'tests/*.test.mjs'   (Node 22.18+; loads the TypeScript modules directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildLunaCardModel, rankCandidates, EMPTY_LUNA_LOOKUPS } from "../frontend/src/components/luna/lunaCardModel.ts";
import { fetchLunaLookups } from "../frontend/src/lib/server/lunaService.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sample = (name) => JSON.parse(readFileSync(resolve(root, "docs/luna-samples", name), "utf8"));
const events = sample("history-events.sample.json").events;
const byId = (prefix) => structuredClone(events.find((e) => e.event_id.startsWith(prefix)));

// Lookups exactly as /api/luna/lookups builds them, from the captured handler/list/stream responses.
const handlers = sample("handlers.sample.json").handlers;
const lists = sample("lists.sample.json").lists;
const streams = sample("streams.sample.json").streams;
const LOOKUPS = {
  handlers: Object.fromEntries(
    handlers.map((h) => [
      h.handler_id,
      {
        name: h.description,
        labels: Object.fromEntries(h.match_policy.filter((p) => p.candidates?.list_id).map((p) => [p.label.trim(), p.candidates.list_id])),
      },
    ])
  ),
  lists: Object.fromEntries(lists.filter((l) => l.user_data).map((l) => [l.list_id, l.user_data])),
  streams: Object.fromEntries(streams.map((s) => [s.stream_id, s.name])),
};

test("top candidate = highest similarity across ALL match_result entries (not the first entry)", () => {
  const ev = byId("c7853b4a"); // one entry: adeel 0.55 is best
  ev.match_result.push({
    label: "officeList",
    candidates: [{ similarity: 0.91, face: { face_id: "11111111-2222-3333-4444-555555555555", external_id: "later_entry_best", user_data: "" } }],
  });
  const m = buildLunaCardModel(ev, LOOKUPS);
  assert.equal(m.top.name, "later_entry_best");
  assert.equal(m.top.percent, 91);
  assert.deepEqual(m.others.map((o) => o.name).slice(0, 2), ["adeel", "shaban"]);
});

test("candidate order inside a list does not matter", () => {
  const ev = byId("c7853b4a");
  ev.match_result[0].candidates.reverse();
  assert.equal(buildLunaCardModel(ev, LOOKUPS).top.name, "adeel");
});

test("real 2-list event with a 1.0 tie: picks LUNA's top_match face, list resolved via handler policy", () => {
  const ev = byId("1ab83e72"); // match[0] office_staff 'hassan asif' 1.0, match[1] list 'hassan' 1.0, top_match = match[1]
  const m = buildLunaCardModel(ev, LOOKUPS);
  assert.equal(m.top.name, "hassan");
  assert.equal(m.top.faceId, ev.top_match.face_id);
  assert.equal(m.top.percent, 100);
  assert.equal(m.top.label, "list");
  assert.equal(m.top.list, "new_office"); // label 'list' -> bffbb4be… -> 'new_office'
  assert.equal(m.others[0].name, "hassan asif");
  assert.equal(m.others[0].list, "office"); // label 'office_staff' -> ade0af4f… -> 'office'
  assert.equal(m.handler, "new_handler");
});

test("top candidate always equals LUNA's top_match on every matched sample", () => {
  for (const ev of events.filter((e) => e.match_result?.length)) {
    const [best] = rankCandidates(ev, LOOKUPS);
    assert.equal(best.faceId, ev.top_match.face_id, ev.event_id);
  }
});

test("name: external_id, else user_data; missing both -> short face id", () => {
  assert.equal(buildLunaCardModel(byId("c7853b4a"), LOOKUPS).top.name, "adeel"); // external_id
  assert.equal(buildLunaCardModel(byId("f7f8c77d"), LOOKUPS).top.name, "hassan"); // external_id '' -> user_data
  const ev = byId("fc3c3895");
  for (const c of ev.match_result[0].candidates) c.face = { face_id: c.face.face_id, external_id: "", user_data: "  " };
  const m = buildLunaCardModel(ev, LOOKUPS);
  assert.match(m.top.name, /^Face [0-9a-f]{8}$/);
});

test("camera: LUNA Streams name over a stale source; source only; stream id fallback; none -> null", () => {
  assert.equal(buildLunaCardModel(byId("ce3d2066"), LOOKUPS).camera, "entrance"); // source 'testing', stream 'entrance'
  assert.equal(buildLunaCardModel(byId("e7724bc5"), LOOKUPS).camera, "demo_cam"); // source only
  const ev = byId("c7853b4a");
  assert.equal(buildLunaCardModel({ ...ev, source: null }, EMPTY_LUNA_LOOKUPS).camera, ev.stream_id); // unresolved id
  assert.equal(buildLunaCardModel(byId("fc3c3895"), LOOKUPS).camera, null); // no source, no stream_id: never guessed
});

test("list: name when resolved, list id when the name is unknown, match label otherwise", () => {
  const ev = byId("c7853b4a"); // office_handler, label officeList
  assert.equal(buildLunaCardModel(ev, LOOKUPS).top.list, "new_office");
  const listId = LOOKUPS.handlers[ev.handler_id].labels.officeList;
  assert.equal(buildLunaCardModel(ev, { ...LOOKUPS, lists: {} }).top.list, listId);
  assert.equal(buildLunaCardModel(ev, EMPTY_LUNA_LOOKUPS).top.list, "officeList");
  // label from an older policy that the handler no longer has
  const old = buildLunaCardModel(byId("ce3d2066"), LOOKUPS).others.find((o) => o.label === "office");
  assert.equal(old.list, "office");
  assert.equal(old.listId, null);
});

test("unmatched body-only event: no top, attribute summary kept, unknown values hidden", () => {
  const m = buildLunaCardModel(byId("23b5dcdf"), LOOKUPS); // apparent_gender 2 (unknown), age 35, black/gray top
  assert.equal(m.matched, false);
  assert.equal(m.top, null);
  assert.equal(m.attributesSummary, "~35y • black/gray top");
  const labels = m.attributes.map((a) => a.label);
  assert.ok(!labels.includes("Gender"), "unknown gender (2) must not be shown as Female");
  assert.ok(!labels.includes("Headwear") && !labels.includes("Backpack"), "state 2 = unknown, hidden");
  assert.equal(buildLunaCardModel(byId("14d0b5cb"), LOOKUPS).attributesSummary, "~37y");
});

test("other candidates: best first, one row per person, never the top person, at most 5", () => {
  const m = buildLunaCardModel(byId("e7724bc5"), LOOKUPS); // 'toqeer' appears twice in the payload
  assert.equal(m.top.name, "toqeer");
  assert.ok(!m.others.some((o) => o.name === "toqeer"));
  const sims = m.others.map((o) => o.similarity);
  assert.deepEqual(sims, [...sims].sort((a, b) => b - a));
  assert.ok(m.others.length <= 5);
});

test("details: ids, times, track, location and only present attributes", () => {
  const ev = byId("c7853b4a");
  const m = buildLunaCardModel(ev, LOOKUPS);
  assert.equal(m.eventId, ev.event_id);
  assert.equal(m.trackId, ev.track_id);
  assert.equal(m.createTime, ev.create_time);
  assert.ok(m.location && m.location.includes("Rawalpindi"));
  assert.ok(m.attributes.every((a) => a.value && a.value !== "undefined"));
  assert.ok(m.attributes.some((a) => a.label === "Emotion"));
});

test("/api/luna/lookups: names only (no RTSP URLs/credentials), one LUNA round per TTL", async () => {
  process.env.LUNA_HOST = "luna.test";
  process.env.LUNA_API_PORT = "5000";
  process.env.LUNA_WEB_PORT = "8080";
  process.env.LUNA_AUTH_USER = "test-user";
  process.env.LUNA_AUTH_PASS = "test-pass";
  const rawStreams = sample("streams.sample.json").streams.map((s) => ({ ...s, data: { reference: "rtsp://cam-user:cam-pass@camera.test/stream" } }));
  const rawHandlers = handlers.map((h) => ({ handler_id: h.handler_id, description: h.description, policies: { match_policy: h.match_policy } }));
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
    const u = String(url);
    const body = u.includes("/luna-streams/") ? { streams: rawStreams } : u.includes("/handlers") ? rawHandlers : { lists };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const first = await fetchLunaLookups();
    const second = await fetchLunaLookups();
    assert.equal(first, second, "second call served from cache");
    assert.equal(calls.length, 3, "handlers + lists + streams, once");
    assert.ok(calls.every((c) => c.auth && c.auth.startsWith("Basic ")), "credentials only on the server-to-LUNA requests");
    assert.ok(calls.some((c) => c.url.startsWith("http://luna.test:8080/api/luna-streams/")));
    const json = JSON.stringify(first);
    assert.ok(!/rtsp|cam-pass|test-pass|Basic/.test(json), "no stream URLs or credentials in the response");
    assert.equal(first.complete, true);
    assert.deepEqual(Object.values(first.streams).sort(), streams.map((s) => s.name).sort());
    assert.deepEqual(first, { ...LOOKUPS, complete: true });
  } finally {
    globalThis.fetch = realFetch;
  }
});
