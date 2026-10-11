// Unit tests for the SafeCity pipeline v2 integration points.
// Run: node --test 'tests/*.test.mjs'   (Node 22.18+; loads the TypeScript helper directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  bearer,
  isSafePathSegment,
  streamStatusMap,
} from "../frontend/src/lib/server/pipelineUpstream.ts";
import { personCountWsUrl } from "../frontend/src/lib/wsBaseUrl.ts";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sync = (name) => require(resolve(root, "workers/sync-service/lib", name));
const { streamStatusMap: syncStreamStatusMap } = sync("stream-status.cjs");
const { chooseStartCursor } = sync("sync-cursor.cjs");
const { findFirstIdSince } = sync("backfill-search.cjs");

// Shape returned by GET /api/v1/stream-status on the streaming server (2026-10-11).
const STREAM_STATUS = {
  generated_at: "2026-10-11T19:59:26Z",
  mediamtx: "up",
  counts: { total: 3, online: 2, offline: 1 },
  streams: [
    { name: "Gelecek", type: "camera", online: true, since: "2026-10-11T13:17:24Z" },
    { name: "server_room", type: "camera", online: true, since: "2026-10-11T13:17:24Z" },
    { name: "parking", type: "video", online: false, since: "2026-10-11T13:17:25Z" },
  ],
};

test("bearer: header only when a token is set", () => {
  assert.deepEqual(bearer("abc"), { Authorization: "Bearer abc" });
  assert.deepEqual(bearer(""), {});
  assert.deepEqual(bearer(undefined), {});
  assert.deepEqual(bearer(null), {});
});

test("isSafePathSegment: camera names and event ids pass, traversal does not", () => {
  for (const ok of ["Gelecek", "server_room", "stage2_yolo_test-s1790578127-1010589", "absence-CEO_room-1728", "a:b.c"]) {
    assert.equal(isSafePathSegment(ok), true, ok);
  }
  for (const bad of ["", ".", "..", "...", "a/b", "../x", "a b", "%2e%2e", "a?b", null, 5]) {
    assert.equal(isSafePathSegment(bad), false, String(bad));
  }
  assert.equal(isSafePathSegment("x".repeat(101), 100), false);
});

for (const [label, parse] of [
  ["app", streamStatusMap],
  ["sync", syncStreamStatusMap],
]) {
  test(`${label} streamStatusMap: online -> running/stopped, keyed lower-case`, () => {
    const map = parse(STREAM_STATUS);
    assert.equal(map.get("gelecek"), "running");
    assert.equal(map.get("server_room"), "running");
    assert.equal(map.get("parking"), "stopped");
    assert.equal(map.size, 3);
  });

  test(`${label} streamStatusMap: old /api/streams/list shape and junk give an empty map`, () => {
    assert.equal(parse({ rows: [{ name: "Gelecek", ffmpeg: "running" }] }).size, 0);
    assert.equal(parse(null).size, 0);
    assert.equal(parse({ streams: "x" }).size, 0);
    assert.equal(parse({ streams: [null, { online: true }, { name: " ", online: true }] }).size, 0);
  });

  test(`${label} streamStatusMap: only boolean true counts as online`, () => {
    const map = parse({ streams: [{ name: "a", online: "true" }, { name: "b" }, { name: "c", online: 1 }] });
    assert.deepEqual([...map.values()], ["stopped", "stopped", "stopped"]);
  });
}

test("chooseStartCursor: a saved cursor is never changed (real-time sync after first start)", () => {
  const r = chooseStartCursor({ savedCursor: 500, localMaxId: 900, backfillHours: 1, firstIdInWindow: 800, sourceMaxId: 1000 });
  assert.equal(r.cursor, 500);
});

test("chooseStartCursor: new deployment with a 1 h window starts just before its first row", () => {
  const r = chooseStartCursor({ savedCursor: null, localMaxId: 0, backfillHours: 1, firstIdInWindow: 317100, sourceMaxId: 317228 });
  assert.equal(r.cursor, 317099);
});

test("chooseStartCursor: nothing in the window starts at the source head (only new rows)", () => {
  const r = chooseStartCursor({ savedCursor: null, localMaxId: 0, backfillHours: 1, firstIdInWindow: null, sourceMaxId: 317228 });
  assert.equal(r.cursor, 317228);
});

test("chooseStartCursor: no window means the old behaviour (full history on an empty mirror)", () => {
  const r = chooseStartCursor({ savedCursor: null, localMaxId: 0, backfillHours: null, firstIdInWindow: null, sourceMaxId: 317228 });
  assert.equal(r.cursor, 0);
});

test("findFirstIdSince: finds the first row in the window with few probes, ids with gaps", async () => {
  // ids 1..1000 with every 3rd id missing; created_at grows 1 s per id.
  const ids = Array.from({ length: 1000 }, (_, i) => i + 1).filter((id) => id % 3 !== 0);
  const t0 = 1_700_000_000_000;
  const probe = async (id) => {
    const found = ids.find((x) => x >= id);
    return found === undefined ? null : { id: found, createdAtMs: t0 + found * 1000 };
  };
  const { firstId, probes } = await findFirstIdSince({ probe, minId: 1, maxId: 1000, sinceMs: t0 + 700 * 1000 });
  assert.equal(firstId, 700 % 3 === 0 ? 701 : 700);
  assert.ok(probes < 30, `probes=${probes}`);
});

test("findFirstIdSince: null when the newest row is older than the window", async () => {
  const probe = async (id) => ({ id, createdAtMs: 0 });
  const { firstId } = await findFirstIdSince({ probe, minId: 1, maxId: 10, sinceMs: 1 });
  assert.equal(firstId, null);
});

test("/api/runtime-config sends no pipeline credential or upstream address to the browser", () => {
  const src = readFileSync(resolve(root, "frontend/src/app/api/runtime-config/route.ts"), "utf8");
  for (const key of [
    "CAMERA_FEED_USERNAME",
    "CAMERA_FEED_PASSWORD",
    "CAMERA_FEED_TOKEN",
    "CAMERA_FEED_BASE_URL",
    "DETECTION_API_TOKEN",
    "DETECTION_API_BASE_URL",
    "STREAMS_API_TOKEN",
    "TEAM_DATABASE_URL",
    "DATABASE_URL",
  ]) {
    assert.equal(src.includes(key), false, `runtime-config must not read ${key}`);
  }
});

test("browser WHEP goes through the same-origin proxy with no credentials or public STUN", () => {
  const src = readFileSync(resolve(root, "frontend/src/lib/webrtcStreamManager.ts"), "utf8");
  assert.match(src, /`\/api\/camera-feed\/\$\{encodeURIComponent\(entry\.sourceName\)\}\/whep`/);
  assert.equal(/Authorization|btoa\(|stun:/.test(src), false);
});

test("personCountWsUrl: empty URL uses the page host on PERSON_COUNT_WS_PORT (works from any PC)", () => {
  assert.equal(personCountWsUrl(null, 8091, { protocol: "http:", hostname: "operator-pc.lan" }), "ws://operator-pc.lan:8091");
  assert.equal(personCountWsUrl("", 8091, { protocol: "https:", hostname: "dash.local" }), "wss://dash.local:8091");
  assert.equal(personCountWsUrl(null, 8091, { protocol: "http:", hostname: "[::1]" }), "ws://[::1]:8091");
  assert.equal(personCountWsUrl("ws://other:9000", 8091, { protocol: "http:", hostname: "x" }), "ws://other:9000");
  assert.equal(personCountWsUrl(null, null, { protocol: "http:", hostname: "x" }), null);
  assert.equal(personCountWsUrl(null, 8091, null), null);
});

test("compose: every host port comes from .env and is required", () => {
  const compose = readFileSync(resolve(root, "docker-compose.yml"), "utf8");
  for (const key of ["APP_PORT", "LOCAL_DB_PORT", "PERSON_COUNT_WS_PORT"]) {
    assert.match(compose, new RegExp(`\\$\\{${key}:\\?`), `${key} must be required`);
  }
  // Published host sides are variables only (container-internal ports may be literal).
  const published = [...compose.matchAll(/^\s*- "([^"]+)"$/gm)].map((m) => m[1]).filter((v) => v.includes(":"));
  for (const mapping of published) {
    const host = mapping.replace(/^127\.0\.0\.1:/, "").split(":")[0];
    assert.match(host, /^\$\{/, `host port must come from .env: ${mapping}`);
  }
  assert.equal(/container_name: safecity-(db|dashboard|sync|person-count-ws)\b/.test(compose), false);
});
