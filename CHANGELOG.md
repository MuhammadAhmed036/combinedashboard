# Changelog

## 2026-10-11 — Multi-class region alerts: show every detected class

### What changed

- Server alert engine (`workers/sync-service`) records a per-class breakdown for each match:
  `detections_json = {inside: {car: 9, truck: 3, person: 1}, outside: {car: 14, truck: 1}}` (was bare totals),
  the shape the dashboard already reads. Totals stay in `person_count_inside/outside` (legacy column names).
- Live Alerts feed (`alertEventsService.ts`) parses that breakdown (it was hard-coded empty).
- Live Alerts card and detail dialog (`AlertRail.tsx`) show the classes the event actually detected, most frequent
  first ("Car +2"; dialog "Car, Truck, Person", inside/outside per class) instead of the rule's first class only.
  Events recorded before this change show all classes of their rule.

### Why

- A rule for person + truck + car on `parking` fired on vehicles, but every alert was labelled "person": the card
  took `classNames[0]` of the rule and the engine stored no per-class counts.

### Tested

- `node --test 'tests/*.test.mjs'`: 34 pass (5 new: engine per-class counts, detected-class order, vehicle-only event
  not shown as person, fallback to all rule classes, stored shape matches the parser).
- `next build` incl. TypeScript; ESLint on the changed files: same 4 pre-existing errors before and after.
- On the VM: rebuilt and recreated only `combined-dashboard` and `combined-sync` (sync resumed from its cursor).
  First real event after the change for the parking rule: `{"inside": {"car": 9, "truck": 3, "person": 1}, "outside":
  {"car": 14, "truck": 1}}`; the feed renders "Car +2" / "Car, Truck, Person". `scripts/verify-pipeline.sh` 10/10.

### Not tested / not done

- The rendered card/dialog in a browser (no browser on the VM).
- Existing alert events keep their totals-only records (no backfill of the breakdown).

### Rollback

- Revert the four frontend files and `workers/sync-service/index.js` + `lib/class-counts.cjs`, rebuild, and
  `docker compose up -d --no-deps app sync`. Events written meanwhile keep the object shape, which older code shows as
  plain totals.

## 2026-10-11 — LUNA panel cards: person name, camera, list; expandable details

Field map and evidence: `AUDIT_PIPELINE_INTEGRATION.md` §13, real payloads in `docs/luna-samples/`.

### What changed

- **Collapsed card** (Live and History share `LunaEventCard`): Line 1 = name of the **highest-similarity candidate
  across all `match_result` entries** (`face.external_id`, else `face.user_data`; ties go to LUNA's own `top_match`
  face); the % badge is that same score. Line 2 = camera: LUNA Streams name for `stream_id`, else `source`, else the
  stream id; "Unknown camera" when the event has neither (never guessed from the handler). Line 3 = the list that
  candidate matched from (match label → handler match policy → list id → list name; fallback list id, then the
  label). Unmatched: "Unknown" + the attribute summary (gender, ~age, clothing). Layout, crops, reference
  thumbnail, timestamp, score colours/thresholds and Trace are unchanged; long text truncates with the full value on hover.
- **Expanded view** (click, Enter/Space; Esc or click again collapses; one at a time; Trace and image clicks do not
  toggle): larger detected + reference images, person, similarity, list, external id, face id, camera, handler, event
  time / track start-end, track id, location, the present attributes, up to 5 other candidates (one row per person,
  best first) and the event id with a copy button (works on plain-HTTP pages). Empty fields are not shown. While a
  Live card is open the list is frozen ("N new events" note) so new events neither collapse it nor push it down,
  and the open event is never trimmed out of the 50-event window.
- **New `GET /api/luna/lookups`** (server-side, existing LUNA credentials): handler names + match label → list id,
  list names, LUNA Streams camera names — names and ids only (stream objects carry RTSP credentials). Cached in
  memory (60 s; 15 s after a partial failure), one in-flight request shared, paged. The panel fetches it once per
  minute for all cards; cards render immediately and update when names arrive.
- The card no longer shows the handler as the camera and no longer calls LUNA directly for handler names.
- The trace modal receives the corrected person and list name, and the camera name only when it is known.
- Unknown values are hidden instead of mislabelled: body `apparent_gender` 2 (was shown as "Female"), headwear /
  backpack state 2.

### Why

- Cards showed the list label ("officeList") as the title, the handler ("office_handler") as the camera and the
  label again as the list; the matched person was never shown. The real payloads put the name in the candidate's
  `face.external_id`/`user_data`, the camera in `stream_id`/`source`, and the list behind the handler's match policy.

### Tested

- `node --test 'tests/*.test.mjs'`: 29 pass (18 existing + 11 new on the captured samples: top similarity across
  several match lists and candidate orders, tie → `top_match`, name fallbacks incl. missing name, camera from stream
  name / source / id / none, list name → list id → label, unmatched summary with unknown gender hidden, other-candidate
  de-duplication, details, and the lookup route with a stubbed LUNA: names only, no RTSP/credentials, one LUNA round per TTL).
- `next build` incl. TypeScript; ESLint on the changed files: no problems in new/changed code (remaining ones are
  pre-existing in unchanged lines; 36 → 22 problems in these files).
- Rebuilt and recreated only `combined-dashboard`; every other container kept its start time.
- Live on the VM: `/api/luna/lookups` 200, complete, 12 handlers / 10 lists / 3 cameras, no secrets, ~10 ms cached;
  12 older real History events (the panel's own gateway query, `create_time__lt` 2026-10-08) mapped with the
  deployed code: names = highest-similarity candidates, cameras from `stream_id`, lists resolved (`officeList` → `new_office`).
  The served client bundle contains the new card code. `scripts/verify-pipeline.sh` 10/10.

### Not tested / not done

- **Live tab with live events**: LUNA produced none (all three LUNA streams in `failure`, newest event 2026-10-09);
  the Live payload could not be captured — Live cards use the same event shape (the panel merges `GET /events/<id>`).
- **The rendered cards in a browser** (no browser on the VM): see the browser checklist in the report.
- Recent `office_handler` events carry no `source`/`stream_id`, so their camera stays "Unknown camera" — the LUNA
  stream/handler setup has to send it.
- Not changed (reported): the browser still calls LUNA directly with credentials from `/api/runtime-config` for
  History/Live seeding/images; the History filter labels headwear state 2 as "Helmet" although the data shows it means unknown.

### Rollback

- `git checkout -- <files>` for the unstaged LUNA changes (the staged pipeline changes are separate in the index), delete
  `frontend/src/components/luna/lunaCardModel.ts`, `useLunaLookups.ts`, `frontend/src/app/api/luna/lookups/`,
  `tests/luna-card-model.test.mjs`, `docs/luna-samples/`; rebuild and `docker compose up -d --no-deps app`. No env, DB or
  LUNA changes.

## 2026-10-11 — Pipeline v2 integration (SafeCity pipeline on 192.168.18.213)

Full audit, evidence and the env mapping: `AUDIT_PIPELINE_INTEGRATION.md`.

> **Security: until the dashboard has a sign-in (open follow-up #1), port `APP_PORT` (3002) must only be
> reachable on the LAN.** The dashboard now proxies live video and detection frames with server-side
> tokens, and every API route is open to anyone who can reach that port.

### What changed

- **Detection API (:18088)**: every call carries `Authorization: Bearer DETECTION_API_TOKEN` (frame-image proxy,
  AI camera list). The image proxy forwards exactly `v2/events/<safe id>/image?kind=raw|annotated`, so
  `v2/events/../../x` can no longer reach other viewer paths with the token. The browser no longer loads
  images straight from :18088 (`/api/runtime-config` returns `apiBase: null`); everything goes through `/api/ai`.
- **Alert frames**: the event behind a stored `source_raw_image_path` is found by an exact lookup in the local mirror
  (`raw_image_path`) instead of splitting the file name, which breaks on Stage 2's new names.
- **Camera list**: `STREAMS_API_URL` → `/api/v1/stream-status` with `Bearer STREAMS_API_TOKEN` (the old
  `/api/streams/list` + Basic auth is rejected). `STREAMS_API_USERNAME/PASSWORD` removed.
- **Live video (WHEP)**: new same-origin proxy `POST /api/camera-feed/<cam>/whep` and
  `DELETE /api/camera-feed/<cam>/whep/<session>` (ported from Nats_New) add `Bearer CAMERA_FEED_TOKEN` server-side
  and rewrite `Location`. The browser no longer receives `CAMERA_FEED_BASE_URL/USERNAME/PASSWORD`
  (they were in `/api/runtime-config`). `iceServers: []` as in Nats_New; the public Google STUN fallback is removed.
  The streaming server serves only WHEP, so the thumbnail's iframe player fallback is removed, and `playerUrl`
  is the same-origin WHEP route (without it, the GET fallback failed and switched the stream off).
- **Absence rules (app + sync)**: the camera gate uses the stream-status `online` field (`online: true` = running)
  instead of the old `ffmpeg` field, which no longer exists and kept every absence rule blocked. WHEP health probes use
  the token; a refused token (401/403) now counts as not live.
- **Sync**: team DB via the read-only role `dashboard_sync` (was the owner role on the old host). New
  `SYNC_BACKFILL_HOURS` (1): **only on a new deployment** (no cursor yet) the mirror starts at the first source
  row of the last hour, found by binary search on the primary key (Nats_New's `chooseStartCursor` /
  `findFirstIdSince`, copied into `workers/sync-service/lib/`). The cursor is saved at once; every later start
  resumes from it and sync runs in real time (`SYNC_POLL_MS`). No change to the mirrored columns or queries.
- **Ports are dynamic, never shared with another dashboard on the VM**: every host port comes from `.env`, and compose
  now fails if `APP_PORT` / `LOCAL_DB_PORT` / `PERSON_COUNT_WS_PORT` is missing. New `scripts/check-ports.sh`
  preflight checks that each port key is valid, distinct, and free or owned by this project; on a conflict it names
  the listener and suggests a free port. `PERSON_COUNT_WS_URL` may be empty: the browser then uses
  `ws(s)://<page host>:PERSON_COUNT_WS_PORT` (`personCountWsPort` in runtime-config), so the port lives in one key.
  `deploy.sh` / `status.sh` / `update-env.sh` no longer fall back to 3000/8090/5470 (the other dashboard's ports).
- **Compose**: project `name: combined` (both compose files); containers `combined-db`, `combined-dashboard`,
  `combined-person-count-ws`, `combined-sync` (was `safecity-*`; `safecity-db` was already taken on this VM
  by the Nats_New dashboard); volumes `combined_db-data`, `combined_app-data`; image tags `combined-0.1.0`. The DB init
  mount points at `database/init-db` (it pointed at the non-existent `docker/init-db`, so a fresh DB had no tables).
  `repair-db-password.sh`, `repair-schema.sh` and `update-env.sh` target `combined-*` only. `luna-ws` is unchanged.
- `check-env.mjs` requires `DETECTION_API_TOKEN`, `STREAMS_API_TOKEN`, `CAMERA_FEED_TOKEN` and
  `PERSON_COUNT_WS_PORT` instead of the removed Basic-auth keys and the WS URL.
- `.env.example`, README run section and env reference updated. Luna code, routes, ws and every `LUNA_*` /
  `NEXT_PUBLIC_LUNA_WS_URL` line are unchanged.

### Why

- The SafeCity pipeline was hardened: the detection API, stream-status API and WHEP all require Bearer tokens, the
  camera list moved to `/api/v1/stream-status`, and the team DB is read through a read-only role. Old credentials
  get 401/403 (evidence in the audit, §2). This dashboard runs on the same VM as the Nats_New dashboard,
  so names and ports must never collide.

### Tested (for real, on VM 192.168.18.213, 2026-10-11)

- `node --test 'tests/*.test.mjs'` — 18 tests: Bearer header, safe path segments, stream-status → running/stopped (app + sync),
  start cursor (saved cursor kept, 1 h window, empty window, no window), binary search, runtime-config has no
  pipeline secret, browser WHEP uses the proxy with no credentials/STUN, WS URL from page host, compose ports from .env.
- `docker compose build`: `next build` incl. TypeScript passes.
- Stack started as project `combined` after `scripts/check-ports.sh`; fresh volume, schema created (6 tables).
- `scripts/verify-pipeline.sh` (10/10 pass): runtime-config clean; camera list = 7 cameras from stream-status (no
  registry fallback); WHEP proxy reaches the streaming server with the token; traversal camera name rejected;
  frame image via `/api/ai` 200 image/jpeg; viewer traversal 404; classes per camera from the mirror; `/api/stats/classes`
  200; person-count WS message received; mirror at the source head.
- Full WHEP signalling with a complete SDP offer through the proxy: 201 + SDP answer (H264, host candidates on the LAN),
  `Location` rewritten to `/api/camera-feed/<cam>/whep/<id>`, DELETE 204; no upstream address/token in the response.
- Real-time sync on live data: the pipeline wrote new rows at 20:46 UTC (source max 317228 → 317230 → 317231) and
  the mirror followed within its 1 s poll (local count 8 → 10; sync log `mirrored 1 new detection_events row(s),
  cursor=317229`, `…317230`, `…317231`).
- Sync: first start found the 1 h window (first source id in 20 index lookups), mirrored 8 rows, saved the cursor;
  after `docker restart combined-sync` it resumed from the saved cursor with no new backfill.
- The 12 pipeline / Nats_New containers have the same start time and restart count before and after; Nats_New's
  ports 3000/8090/5433 are untouched by this project.
- Luna: `/api/luna/handlers` and `/api/luna/events` return 200 (Luna was up); no pipeline route or service imports Luna code.

### Not tested / not done

- **Video actually playing in a browser** (ICE/DTLS + decoded frames): no browser on the VM. Use the browser
  checklist in the final report from an operator PC.
- **Pipeline pages with Luna down**: Luna was up; simulating an outage needs a Luna env change (frozen) or a
  firewall rule (sudo). Independence is shown by code (no Luna imports in pipeline routes/services).
- Absence-rule firing end to end (no rules in the fresh DB).
- `cameraSnapshot.ts` (live camera snapshot fallback) cannot work with the new API (no `input_url`); returns null.
- Duplicate top-level folders (`alerts/ apis/ backend/ maps/ mediawall/ sync/ configs/ migrations/`) are not built
  and were left untouched; they still contain the old code.

### Rollback

- `docker compose down` (project `combined`; keeps the `combined_db-data` volume), `git checkout withaudit_2.3`,
  restore `.env.bak-2026-10-11` as `.env`, rebuild. The old configuration only works against the old pipeline (.216).
- The local DB volume can be removed with `docker compose down -v` (deletes this dashboard's local alerts/history only).
- Nothing outside this project was changed; the team DB is only read (role has no write privilege).
