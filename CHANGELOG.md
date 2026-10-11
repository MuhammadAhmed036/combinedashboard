# Changelog

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
