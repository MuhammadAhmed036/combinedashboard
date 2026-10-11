# Pipeline integration audit — combinedashboard → SafeCity pipeline v2 (VM 192.168.18.213)

Date: 2026-10-11 · Branch: `pipeline-v2-integration` (off `withaudit_2.3` @ `71be8ff`) · Phase 1 (read-only audit)

Reference (read-only): `~/dashboard/Nats_New` (branch `per-camera-detection-settings` @ `d72c591`), running in
host mode (`next-server` :3000, `person-count-ws` :8090, `sync-service`, dev DB container `safecity-db`
127.0.0.1:5433, compose project `nats_dev`). Nothing of it was modified.

Secrets in this file are masked (`<…>`). Real values live only in `.env` files.

## Owner decisions already given

- This dashboard keeps its **own new local DB and its own credentials**. It never reuses Nats_New's local DB
  credentials or port. Only the **source** DB (`TEAM_DATABASE_URL`, read-only role `dashboard_sync`) is the same as Nats_New's.
- **Luna is not the main concern.** If Luna is off or not responding, that is acceptable. Luna code and `.env` lines stay
  byte-identical. Verification only shows that they did not change and that the pipeline works whatever state Luna is in.

---

## 1. Inventory

### 1.1 combinedashboard: what is actually built and run

The root `docker-compose.yml` (project `safecity-newdashboard`) builds:

| service | build source | talks to |
|---|---|---|
| `db` (postgres:16-alpine) | — (init SQL mount `./docker/init-db`; **this path does not exist**, see F1) | — |
| `app` (Next.js 16.2.9) | `docker/Dockerfile`, which copies **only `frontend/`** | local DB, Detection API :18088, Streams API :8000, WHEP :8889, Luna |
| `person-count-ws` | `websocket/person-count-ws` | local DB only |
| `sync` | `workers/sync-service` | team DB (read), local DB (read/write), Streams API, WHEP |
| `luna-ws` | `websocket/luna-ws` | Luna (frozen) |

The top-level `alerts/ apis/ backend/ maps/ mediawall/ sync/ configs/ database/ migrations/ docker/docker-compose.yml`
directories hold copies that were last touched in the "first commit". The build does not use them: the Dockerfile copies
`frontend/`, and compose uses `workers/` and `websocket/`. `sync/sync-service` matches `workers/sync-service` byte for byte.
`database/init-db`, `migrations/init-db` and `docker/docker/init-db` are identical to one another.

### 1.2 Pipeline-facing code in the built app (`frontend/`)

| upstream | file | how |
|---|---|---|
| Streams API | `src/lib/server/streams.ts:219-258` (`fetchStreams`) | `authenticatedFetch` with Basic `STREAMS_API_USERNAME/PASSWORD` |
| Streams API | `src/lib/server/absenceEngine.ts:94-126` (`fetchCameraStatuses`) | Basic, then parses `data.rows[].ffmpeg` |
| Streams API | `src/lib/server/cameraSnapshot.ts:67-98` | Basic, then reads `rows[].input_url` (camera RTSP credentials) |
| WHEP | `src/lib/webrtcStreamManager.ts:26-131` | **the browser** POSTs SDP straight to `CAMERA_FEED_BASE_URL/<cam>/whep` with Basic creds that it got from `/api/runtime-config` |
| WHEP | `src/lib/server/streams.ts:100-126` (`checkStreamHealth`) | probe POST with Basic |
| WHEP | `src/lib/server/absenceEngine.ts:144-172` (`checkWebRtcHealth`) | probe POST with Basic |
| MediaMTX GET | `src/app/api/camera-feed/[cameraName]/route.ts` | GET proxy with Basic/Digest |
| MediaMTX player | `src/lib/server/streams.ts:179-189` (`buildPlayerUrl`) → `CameraThumbnail.tsx:110-122` | the browser opens an **iframe on the upstream URL** |
| Detection API | `src/app/api/ai/[...path]/route.ts:140` | image proxy **without a token** |
| Detection API | `src/lib/server/streams.ts:268-298` (`fetchAiCameraNames`) | `GET /api/cameras` **without a token** |
| Detection API | `DetectionFrameImage.tsx:41-52`, `useCameraLiveFeed.ts:29-45` | the browser loads `apiBase/api/v2/events/<id>/image` **directly** |
| config to browser | `src/app/api/runtime-config/route.ts:12-38` | sends `apiBase`, `cameraFeedBaseUrl`, **`cameraFeedUser`, `cameraFeedPass`** (and Luna values) |
| env check | `scripts/check-env.mjs:6-21` | requires `STREAMS_API_USERNAME/PASSWORD` |

Sync service (`workers/sync-service/index.js`): team DB `SELECT`s only (lines 181, 197, 227, 625, 886, 920).
`getCameraFfmpegStatus` (544-577) and `checkWebRtcHealth` (593-614) use Basic. The absence engine requires
`ffmpeg === "running"` (669-670).

person-count-ws (`websocket/person-count-ws/index.js`) reads only the local `detection_events` and `camera_locations`, and
broadcasts `people_count = detection_count` (line 83).

### 1.3 Nats_New (reference): how it calls the same upstreams

| upstream | Nats_New code | auth |
|---|---|---|
| Stream status | `src/lib/server/streams.ts:194-236` | `Authorization: Bearer STREAMS_API_TOKEN` |
| WHEP offer | `src/app/api/camera-feed/[cameraName]/whep/route.ts` (server-side proxy; rewrites `Location` to its own DELETE route) | `Bearer CAMERA_FEED_TOKEN` |
| WHEP session end | `src/app/api/camera-feed/[cameraName]/whep/[sessionId]/route.ts` | `Bearer CAMERA_FEED_TOKEN` |
| MediaMTX GET fallback | `src/app/api/camera-feed/[cameraName]/route.ts:37-50` | Basic `CAMERA_FEED_USERNAME/PASSWORD`, replaced by Bearer token (Digest kept) |
| Detection images | `src/app/api/ai/[...path]/route.ts` (exactly `v2/events/<safe id>/image?kind=raw|annotated`) | `Bearer DETECTION_API_TOKEN` |
| Detection cameras | `src/lib/server/streams.ts:244-270` | `Bearer DETECTION_API_TOKEN` |
| Browser config | `shared/runtime-config.cjs`: no credentials, no upstream addresses | — |
| Team DB | `TEAM_DATABASE_URL` = `dashboard_sync` role; `search_path=compat, public` (CHANGELOG "Still open") | read-only |

Nats_New also has login, a settings store, TLS pinning and an upstream-health banner. None of these is needed for the
integration, so none will be ported (rule 3).

---

## 2. Live contract verification (read-only requests, run 2026-10-11 ~19:59 UTC)

All requests used Nats_New's tokens, run either from the host or from a throwaway `--rm` container.

### 2.1 Detection API `http://192.168.18.213:18088` (uvicorn)

```
api/cameras          no-token=401  token=200
api/health           no-token=200  token=200
api/v2/events        no-token=401  token=200
api/stats            no-token=401  token=200
image kind=raw       no-token=401  token=200 image/jpeg 246008B
image kind=annotated no-token=401  token=200 image/jpeg 246008B
401 body: {"detail":"viewer authentication required"}   www-authenticate: Bearer
```
`/api/cameras` → `{"cameras":[{"camera_id","events","latest_ts"},…]}`, which combined's `cameraRows()` parses.
`/api/v2/events` → `{total,limit,offset,has_more,events:[{id,event_id,camera_id,zone,scene,detection_ts,detections:[{class_id,class_name,confidence,bbox_xyxy,…}],…}]}`.
**Consequence:** combined's image proxy, its AI-camera list, and the browser's direct image URLs all get **401** today.
Per-class counts and history in combined come from the **local mirror** (`detections_json`), not from :18088. :18088 is
only used for frame images and the AI-camera badge.

### 2.2 Streams API `http://192.168.18.213:8000`

```
old /api/streams/list   no-auth=401  basic(admin/<old>)=403  bearer=401
new /api/v1/stream-status no-auth=401 basic=403              bearer=200
```
Response: `{"generated_at","mediamtx":"up","counts":{…},"streams":[{"name":"AXI_coordor","type":"camera","online":true,"since":…},…]}`
(7 streams: AXI_coordor, CEO_room, Gelecek, entrance, kitchen, parking, server_room).
- `streams.ts` normalizer: `cameraRows` finds `streams[]`, `name` gives the source name, and `online` (boolean) gives the status.
  **The shape is already compatible; only the auth must change.**
- `absenceEngine.fetchCameraStatuses` and `sync getCameraFfmpegStatus` read `data.rows[].ffmpeg`. The new API has no `rows` and no
  `ffmpeg`, so the map is empty. On the sync side that means `"unknown"`, which is never `"running"`, so **every absence rule is
  blocked forever** ("Camera is stopped on Streaming Server"). The frontend copy defaults to `"running"` instead.
- `cameraSnapshot.ts` needs `rows[].input_url` (camera RTSP credentials). The new API does not expose it, so the snapshot
  fallback returns `null`. It degrades gracefully. **Not fixable without a new upstream field. Not changed.**

### 2.3 WHEP `http://192.168.18.213:8889` (uvicorn gateway in front of MediaMTX)

Probe POST with a deliberately invalid SDP (no session is created):
```
no-auth                    401  www-authenticate: Bearer realm="GelecekStreamingClient"
basic admin/<old>          403
basic client/<new pw>      400   (auth OK, SDP rejected)
bearer CAMERA_FEED_TOKEN   400   (auth OK, SDP rejected)
bearer, unknown path       404
OPTIONS                    405   (combined's browser ICE discovery gets nothing)
GET /<cam>/ player page    404   (combined's iframe fallback is dead)
```
### 2.4 IP binding of tokens (Nats_New `.env.example`: "bound to this server's IP")

From a throwaway container on the default bridge network of this VM:
```
whep bearer -> 400 (accepted)   stream-status bearer -> 200   detection /api/cameras bearer -> 200
```
So a containerized combined app **on this VM** is accepted. Traffic leaves with the host's IP.

### 2.5 Team DB `yolo_events` @ 192.168.18.213:15432 as `dashboard_sync`

```
current_user=dashboard_sync  search_path="compat, public"  member_of={pg_read_all_data}
SELECT=t INSERT/UPDATE/DELETE=f on compat.detection_events, public.detection_events, camera_locations, alerts
compat.detection_events = view over detection_events_v1 (38 cols); rows 256463, max(id) 317228
camera_locations: 0 rows      raw_image_status: deleted 254667 / available 1796
classes in last 5000 rows: person only
```
- All 23 columns that combined's sync selects (`DETECTION_EVENTS_COLUMNS`, index.js:75-80) exist in `compat.detection_events`.
  All 18 `CAMERA_LOCATIONS_COLUMNS` exist in `public.camera_locations`. **No SQL change is needed in the sync service.**
- The role can only read, so "never write to the team DB" is also enforced by the database itself. Combined's current
  `TEAM_DATABASE_URL` uses the **owner role `yolo` on .216**, which can write. Switching to `dashboard_sync` is a safety improvement.
- Raw image paths now look like `/data/events/images/raw/2026-10-11T19_28_22.406Z_Gelecek_stage2_yolo_test-s1790578127-1010589.jpg`
  and event ids look like `stage2_yolo_test-s…`. Combined's `extractEventIdFromPath` (`api/ai/[...path]/route.ts:51-61`)
  expects `docker-ovcpp-…`, or else splits on `_`. With the new names it returns a **wrong id**
  (`22.406Z_Gelecek_stage2_…`), which breaks alert-frame lookup for alerts that stored `source_raw_image_path`.
- Camera ids differ in case between systems (`server_room` stream vs `Server_room` detections; historical `Entrance`/`entrance`).
  This is pre-existing. Combined lower-cases in most matches. Noted as a risk, not changed.

### 2.6 person-count-ws

Reads only this dashboard's local DB, with no upstream calls and nothing to port. `people_count = detection_count` counts all
classes. Today the pipeline emits only `person`, so the value is correct now, but it would over-count if the model starts
emitting other classes (Nats_New uses per-class `class_counts`). Pre-existing behavior; not changed (rule 3).

---

## 3. Findings (pipeline side)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | **Blocker** | Root compose mounts `./docker/init-db`, which does not exist, so a fresh DB has **no tables** and sync, person-count-ws and the app all fail | `docker-compose.yml:16`; `ls docker/init-db` → No such file; no `CREATE TABLE` anywhere in `frontend/src`, `workers`, `websocket` |
| F2 | **Blocker** | `container_name: safecity-db` collides with Nats_New's **running** dev DB container | `docker ps`: `safecity-db … nats_dev` |
| F3 | **Blocker** | Detection API calls carry no token, so they get 401 | §2.1 |
| F4 | **Blocker** | Streams API: old URL and Basic auth, so 401/403 | §2.2 |
| F5 | **Blocker** | Live video: the browser POSTs WHEP straight to :8889 with Basic creds; the old creds get 403, and the new auth is a Bearer token | §2.3, `webrtcStreamManager.ts:40-108` |
| F6 | **Security** | `/api/runtime-config` returns `CAMERA_FEED_USERNAME/PASSWORD` to any browser without login | `runtime-config/route.ts:32-34` |
| F7 | High | Absence engine (sync + frontend) parses the old `rows[].ffmpeg` field, so with the new API absence rules are permanently blocked | §2.2, `index.js:563-567,669-670`, `absenceEngine.ts:111-118` |
| F8 | High | `check-env.mjs` requires `STREAMS_API_USERNAME/PASSWORD`, so the app container refuses to start once those obsolete keys are removed | `check-env.mjs:9-10`, `docker/docker/entrypoint.sh` |
| F9 | High | Alert frame lookup: the `extractEventIdFromPath` heuristic breaks on the new image naming | §2.5 |
| F10 | Medium (security) | Image proxy prefix check (`v2/events…`) also lets `v2/events/../../x` through. Harmless today without a token, but once the token is added it becomes a **token-bearing proxy to any viewer path**. Nats_New closed exactly this | `api/ai/[...path]/route.ts:13-17`; Nats_New `api/ai/[...path]/route.ts:15-16,26` |
| F11 | Medium | `PERSON_COUNT_WS_URL=ws://localhost:8091` breaks live counts for any browser that is not on the VM itself. Combined's client has no "empty → page host" fallback (`allCamerasFeed.ts:32`) | §4 |
| F12 | Medium | The thumbnail iframe fallback points the browser at the upstream player page, which returns 404 or 401 and exposes the upstream address | `streams.ts:179-189`, `CameraThumbnail.tsx:110-122`, §2.3 |
| F13 | **Hazard** | `repair-db-password.sh` (`ALTER ROLE … PASSWORD`) and `repair-schema.sh` `docker exec` into a container named **`safecity-db`**, which on this VM is Nats_New's DB. They are mode 644, so `deploy.sh` skips them (`[ -x … ]`), but run by hand they would change Nats_New's DB password. `update-env.sh` polls `safecity-dashboard`. **I will not use `deploy.sh` or these scripts.** | `repair-db-password.sh:43-46`, `deploy.sh:162-167` |
| F14 | Low | WebRTC falls back to the public STUN server `stun.l.google.com` (an outside request on an offline LAN; Nats_New removed it). On a LAN, host candidates are enough | `webrtcStreamManager.ts:63-65` |
| F15 | Low | Image tags `safecity-*:0.1.0` are the names Nats_New's `RUNNING.md` tells people to build. They don't collide today (Nats_New images are tagged `nats-qa` / `0.1.0-b99687b`), but they could later | `docker images` |
| F16 | Info | First sync backfills the **entire** source history (256k rows, 99% with deleted images) into the new local DB, with alert evaluation on every batch. Expected time is minutes (40k rows per poll). Combined has no `SYNC_BACKFILL_HOURS` (that is a Nats_New feature) | `index.js:168-213` |
| F17 | Info | Combined has no login, so every proxy route (images, live video) is open to anyone who can reach `APP_PORT`, and after this change those routes carry the server-side tokens. This is the same posture combined already has for all its APIs. Nats_New gates them with `withAuth`, but porting auth is out of scope unless you ask for it | — |

### Luna (report only: not changed, not a blocker per owner)

- `runtime-config/route.ts:24-31` sends `lunaAuthUser` / `lunaAuthPass` (Luna basic credentials) to the browser.
- `NEXT_PUBLIC_LUNA_WS_URL=ws://localhost:8092` is a `NEXT_PUBLIC_*` value, so it is **baked into the client bundle at build time**, and
  `LunaEventsRail.tsx:1007-1010` prefers it over the page-host fallback. From any other PC the browser therefore dials its own
  `localhost`. If the line were empty, the existing `lunaWsPort` page-host fallback would already work. That needs your decision,
  because it means touching a frozen line.
- `.env.example` has `NEXT_PUBLIC_LUNA_WS_URL=ws://<LUNA_USER>:<LUNA_PASSWORD>@…`, a credential-in-URL template.

---

## 4. Browser-facing URLs (task d)

| key | value | from another PC |
|---|---|---|
| `PERSON_COUNT_WS_URL` | `ws://localhost:8091` | **Broken**: the browser connects to its own localhost. Proposed fix (env-only): `ws://192.168.18.213:8091` |
| `NEXT_PUBLIC_LUNA_WS_URL` | `ws://localhost:8092` | **Broken** (and baked in at build). Frozen, report only |
| `DETECTION_API_BASE_URL` (as `apiBase`) | `http://…:18088` | Reachable, but 401 without a token. Proposed: stop sending it to the browser, so images go through the proxy |
| `CAMERA_FEED_BASE_URL` (as `cameraFeedBaseUrl`) | `http://…:8889` | Reachable, but needs a token. Proposed: stop sending it; WHEP goes through the proxy |

---

## 5. `.env` mapping (non-Luna keys only)

Masked: `<DET_TOKEN>`, `<STREAMS_TOKEN>`, `<FEED_TOKEN>`, `<FEED_PW>` are Nats_New's values. `<OLD_*>` are combined's current values.
`<NEW_LOCAL_PW>` is a new random password for this dashboard's own DB, generated at implementation time. No volume exists
yet, so nothing is lost.

| key | combined current | Nats_New | **target (combined)** | why | read by (built code) |
|---|---|---|---|---|---|
| APP_PORT | 3002 | 3000 | **3002** (keep) | free; 3000 is Nats_New | compose `app.ports` |
| APP_IMAGE_TAG | 0.1.0 | 0.1.0 | **combined-0.1.0** | F15, image-name isolation (env-only) | compose |
| WS_IMAGE_TAG | 0.1.0 | 0.1.0 | **combined-0.1.0** | same | compose |
| SYNC_IMAGE_TAG | 0.1.0 | 0.1.0 | **combined-0.1.0** | same | compose |
| DETECTION_API_BASE_URL | http://192.168.18.216:18088 | http://192.168.18.213:18088 | **http://192.168.18.213:18088** | current pipeline | `api/ai/[...path]`, `streams.ts`, runtime-config |
| DETECTION_API_TOKEN | — (missing) | `<DET_TOKEN>` | **`<DET_TOKEN>`** (new key) | :18088 now requires Bearer (§2.1) | `api/ai/[...path]`, `streams.ts` (new) |
| POLL_INTERVAL_MS | 2000 | 5000 | **2000** (keep) | UI polling of the own API, not a pipeline contract | runtime-config |
| STREAMS_API_URL | http://192.168.18.216:8000/api/streams/list | http://192.168.18.213:8000/api/v1/stream-status | **http://192.168.18.213:8000/api/v1/stream-status** | old endpoint rejected (§2.2) | `streams.ts`, `absenceEngine.ts`, `cameraSnapshot.ts`, sync |
| STREAMS_API_TOKEN | — | `<STREAMS_TOKEN>` | **`<STREAMS_TOKEN>`** (new) | Bearer required | same (new) |
| STREAMS_API_USERNAME | admin | — | **remove** | Basic gets 403; obsolete | (removed from code) |
| STREAMS_API_PASSWORD | `<OLD_PW>` | — | **remove** | obsolete | (removed from code) |
| STREAMS_FALLBACK_NAMES | — | (commented out) | **not added** | combined has no code for it; its fallback is the local registry (`stream-cameras/route.ts:50-63`) | — |
| CAMERA_FEED_BASE_URL | http://192.168.18.216:8889 | http://192.168.18.213:8889 | **http://192.168.18.213:8889** | current pipeline | `streams.ts`, camera-feed routes, `absenceEngine.ts`, sync |
| CAMERA_FEED_TOKEN | — | `<FEED_TOKEN>` | **`<FEED_TOKEN>`** (new) | WHEP Bearer (§2.3) | new WHEP routes, `streams.ts`, `absenceEngine.ts`, sync |
| CAMERA_FEED_USERNAME | admin | client | **client** | Nats_New keeps it for the GET fallback; `admin` gets 403 | `camera-feed/[cameraName]/route.ts` |
| CAMERA_FEED_PASSWORD | `<OLD_PW>` | `<FEED_PW>` | **`<FEED_PW>`** | same | same |
| LOCAL_DB_USER | dashboard | dashboard | **dashboard** (own DB) | own DB, own creds (owner decision) | compose `db` |
| LOCAL_DB_PASSWORD | admin | `<nats local pw>` | **`<NEW_LOCAL_PW>`** | own DB; replaces weak `admin`; never Nats_New's | compose `db`, `DATABASE_URL` |
| LOCAL_DB_NAME | dashboard | dashboard | **dashboard** | own DB (separate container/volume) | compose |
| LOCAL_DB_PORT | 5370 | 5433 | **5370** (keep) | free, distinct from 5433 / 15432 | compose `db.ports` (127.0.0.1 only) |
| DATABASE_URL | postgres://dashboard:admin@127.0.0.1:5370/dashboard | …@localhost:5433/… | **postgres://dashboard:`<NEW_LOCAL_PW>`@127.0.0.1:5370/dashboard** | host-mode only; compose overrides it with `db:5432` | `db.ts`, sync, ws |
| RAW_IMAGE_RETENTION_TARGET | 100 | 100 | **100** | same | `statsStore.ts:263` |
| TEAM_DATABASE_URL | postgres://yolo:`<owner pw>`@192.168.18.216:15432/yolo_events | postgres://dashboard_sync:`<sync pw>`@192.168.18.213:15432/yolo_events | **same as Nats_New** | same source DB, read-only role (owner decision; §2.5) | sync |
| PERSON_COUNT_WS_URL | ws://localhost:8091 | ws://localhost:8090 | **ws://192.168.18.213:8091** | F11; works from other PCs, no code change | runtime-config → `allCamerasFeed.ts` |
| PERSON_COUNT_WS_PORT | 8091 | 8090 | **8091** (keep) | distinct from 8090 | compose, ws |
| POLL_MS | 2000 | 2000 | 2000 | — | ws |
| SYNC_POLL_MS | 1000 | 3000 | **1000** (keep) | own tuning; light id-cursor query | sync |
| SYNC_RECONCILE_MS / BATCH_LIMIT / MAX_BATCHES_PER_POLL / RECONCILE_LIMIT | 60000/2000/20/5000 | same | same | — | sync |
| MAP_CENTER / MAP_DEFAULT_ZOOM / MAP_BOUNDS | — | set | **not added** | combined does not read them | — |
| SETTINGS_ENCRYPTION_KEY | — | set | **not added** | Connections-page feature, not ported | — |

All `LUNA_*` and `NEXT_PUBLIC_LUNA_WS_URL` lines stay byte-identical. Proof will be a diff of `grep -E '^(LUNA_|NEXT_PUBLIC_LUNA_WS_URL)'` before and after.

---

## 6. Planned changes (Phase 2, after approval)

Each item lists the finding it fixes. Luna lines inside shared files are not touched.

**Config / infra**
1. `.env`: the non-Luna keys per §5. Back up to `.env.bak-2026-10-11` first. `.env` stays untracked (`.gitignore`).
2. `.env.example`: the same key set with placeholders (`DETECTION_API_TOKEN=`, `STREAMS_API_TOKEN=<…>`,
   `CAMERA_FEED_TOKEN=<…>`, `/api/v1/stream-status`, read-only role note). The Luna block is left as is.
3. `docker-compose.yml` (F1, F2): init mount `./docker/init-db` becomes `./database/init-db`. Non-Luna `container_name`s
   `safecity-db / -dashboard / -person-count-ws / -sync` become `combined-db / combined-dashboard / combined-person-count-ws / combined-sync`.
   `luna-ws` is left alone (no collision). Project name `safecity-newdashboard` and volumes (prefixed by the project) are already distinct.
4. `repair-db-password.sh`, `repair-schema.sh`, `update-env.sh` (F13): change only the container names to the new ones, so they can
   never touch Nats_New's `safecity-db`. Fix the repair-schema path to `database/init-db`.
5. `frontend/scripts/check-env.mjs` (F8): the required list drops `STREAMS_API_USERNAME/PASSWORD` and adds `STREAMS_API_TOKEN`,
   `CAMERA_FEED_TOKEN` and `DETECTION_API_TOKEN`.

**App (`frontend/`)**

6. `src/app/api/runtime-config/route.ts` and `src/lib/runtimeConfig.ts` (F6): remove `cameraFeedBaseUrl/User/Pass`. `apiBase` returns
   `null`, so the browser always uses the `/api/ai` proxy. The existing fallback code handles `null`; nothing uses `wsBase`. Luna fields untouched.
7. New `src/app/api/camera-feed/[cameraName]/whep/route.ts` and `…/whep/[sessionId]/route.ts` (F5): ported from Nats_New (POST offer
   with Bearer and the `Location` rewrite; DELETE session). Without `withAuth`, the settings store, TLS or the health banner, which combined does not have.
8. `src/lib/webrtcStreamManager.ts` (F5, F14): POST the offer to `/api/camera-feed/<cam>/whep` (same origin, no auth header), drop the
   upstream `OPTIONS`, and use the proxied `Location` for DELETE. Remove the public STUN fallback (F14). This is optional, so tell me if you want it kept.
9. `src/lib/server/streams.ts` (F3, F4, F12): Bearer `STREAMS_API_TOKEN` for the status list, Bearer `CAMERA_FEED_TOKEN` for the health
   probe, Bearer `DETECTION_API_TOKEN` for `api/cameras`. `playerUrl` no longer points the browser at the upstream (exact fallback
   behavior to be verified in the browser during Phase 3).
10. `src/app/api/camera-feed/[cameraName]/route.ts`: add the Bearer token the way Nats_New does (`route.ts:41-44`), plus a safe-segment check on the camera name.
11. `src/app/api/ai/[...path]/route.ts` (F3, F9, F10): Bearer `DETECTION_API_TOKEN`. Accept only `v2/events/<safe id>/image?kind=raw|annotated`
    (as in Nats_New). Resolve the event id behind a stored `source_raw_image_path` with an exact lookup
    `SELECT event_id FROM detection_events WHERE raw_image_path = $1` instead of the filename heuristic. Absence and snapshot logic otherwise unchanged.
12. `src/lib/server/absenceEngine.ts` (F7): Bearer auth. Map `streams[].online` to `"running"` / `"stopped"` so the existing callers
    (`cameras/status`, `frame-status`, absence check) keep their contract. The WHEP probe uses Bearer.
13. A small dependency-free helper module (e.g. `src/lib/server/pipelineAuth.mjs`) for the Bearer header, the
    stream-status-to-status-map parsing and the safe path segment check, so they can be unit-tested with `node:test` without new dependencies.

**Sync service**

14. `workers/sync-service/index.js` (F7): `getCameraFfmpegStatus` uses Bearer `STREAMS_API_TOKEN` and parses `streams[].online`, mapped to
    `"running"`/`"stopped"`. `checkWebRtcHealth` uses Bearer `CAMERA_FEED_TOKEN`. **No SQL changes** (§2.5).

**Not changed (deliberately)**: Luna code/routes/ws; person-count-ws (local DB only); `cameraSnapshot.ts` (degrades to `null`; the new API
has no `input_url`); `frame-status` (returns upstream URLs but no credentials; flag only); the duplicate top-level directories (not built;
they keep their old code, see Risks); login/auth; `SYNC_BACKFILL_HOURS`; per-class `class_counts`.

**Docs/tests**: `CHANGELOG.md` (new: what / why / tested / not tested / rollback); README run section (distinct project, the exact
`docker compose` commands, warning about the `safecity-db` name); `node:test` unit tests for item 13 and the sync parsing; a read-only
`scripts/verify-pipeline.sh` smoke script (curl/psql against the running stack).

---

## 7. Risks

- **Second consumer on the streaming server**: Nats_New says WHEP has a small session limit. Combined adds its own sessions, plus
  probe POSTs (`checkStreamHealth`, one per camera per stream-list refresh, cached 4 s; they fail SDP parsing, so no session). Watch for 429/503.
- **Unauthenticated dashboard holds the tokens** (F17). Anyone on the LAN who reaches :3002 can view video and frames through it.
- **Full backfill** of 256k rows on first start (F16). It takes disk space and a few minutes, and runs alert evaluation over history. Rules are empty on a fresh DB, so no alerts are generated.
- **IP binding**: tokens work from this VM (tested from a container). If this dashboard is moved to another host, the tokens must be re-issued there.
- **Duplicate source dirs** (`backend/`, `sync/`, `apis/` …) keep old code with Basic auth. They are not built, but they will show up in greps and could confuse
  future packaging. Tell me if you want them updated or left alone (default: left alone).
- **Camera id case mismatches** (`server_room` / `Server_room`) can leave a tile without counts. Pre-existing.
- **`deploy.sh` / repair scripts**: not used in this work. After item 4 they target only `combined-*` containers.

---

## 8. Test plan (Phase 3, on this VM, real services)

Before and after: `docker ps` (all 12 pipeline/Nats_New containers up, same `Up` times), `ss -ltnp` (3000/8090/5433 still owned by Nats_New).

1. Unit: `node --test` for the helpers and the sync parsing; `tsc --noEmit`; `next build` inside the image.
2. Start: `docker compose up -d --build` (project `combined`, containers `combined-*`, ports 3002/8091/8092/127.0.0.1:5370).
3. Schema: `psql` into `combined-db` and run `\dt`, which should list the 6 tables.
4. Camera list: `curl :3002/api/stream-cameras`, which should return 7 cameras with `online` statuses and **no** `X-Camera-Source: registry-fallback`.
5. Live video: `curl -X POST :3002/api/camera-feed/Gelecek/whep` with a real offer (from a headless browser, if available on this VM, or the
   probe SDP for auth only). Expect 201 + SDP + a rewritten `Location`, then DELETE it → 204. Browser check from another PC: you, if I can't run a browser here.
6. Images: `curl :3002/api/ai/v2/events/<live id>/image?kind=raw` should return 200 image/jpeg; a traversal path should return 404.
7. Per-class counts and history: `/api/cameras/<id>/classes`, `/api/stats/classes`, `/api/events`, all from the local mirror.
8. Sync: `docker logs combined-sync` should be clean. Local `count(*)` / `max(id)` should increase over time and track the source `max(id)`. The `sync_cursors` row should exist.
9. person-count-ws: a WebSocket client (`node -e` with the `ws` module inside the container) receives `people_count` messages.
10. `/api/runtime-config` should contain no `cameraFeed*`, no tokens and no DB credentials (`grep -iE 'token|pass|feed'`; Luna fields are reported separately).
11. Luna: diff of the `LUNA_*` / `NEXT_PUBLIC_LUNA_WS_URL` lines (byte-identical), `git diff` showing no Luna files, `luna-ws` container state
    and the Luna API routes' status recorded as found. Luna being unreachable is acceptable and is not a failure of this work.
12. Hygiene: `git diff` grep for IPs, tokens and passwords in source; `git diff --stat`; commit to `pipeline-v2-integration`; no push.

## 9. Questions for go-ahead

1. Approve the change list in §6 (items 1–14)?
2. Item 8: remove the public STUN fallback (recommended for an offline LAN), or keep it?
3. Item 3/4: OK to rename the non-Luna container names to `combined-*` and fix the repair/update scripts accordingly?
4. Item 9: the image tag `combined-0.1.0`. OK?
5. Duplicate top-level directories: leave untouched (default)?

---

## 10. Phase 2 decisions (owner, 2026-10-11)

- §6 approved. STUN: removed; `iceServers: []` exactly like Nats_New (`src/components/cameras/WhepPlayer.tsx:81`), no env var.
- Containers renamed `combined-*`, compose project `name: combined` (both compose files), volume keys `db-data` /
  `app-data` (`combined_db-data`, `combined_app-data`). `luna-ws` (container `safecity-luna-ws`) untouched.
- Image tags `combined-0.1.0`.
- Sync: **new deployment only** copies the last `SYNC_BACKFILL_HOURS=1` hours (Nats_New's `chooseStartCursor` +
  `findFirstIdSince`, ported verbatim into `workers/sync-service/lib/`); afterwards real time from the saved cursor.
- Local DB: this dashboard's own new credentials (new random password); only `TEAM_DATABASE_URL` is shared with Nats_New.
- Luna: no changes; a down/unresponsive Luna must not break pipeline pages (verified in Phase 3).
- Ports dynamic (owner, mid-Phase 2): every host port from `.env` and required by compose (`${KEY:?}`); preflight
  `scripts/check-ports.sh` (valid, distinct, free or owned by project `combined`, suggests a free port on conflict);
  `PERSON_COUNT_WS_URL` empty → browser uses `ws(s)://<page host>:PERSON_COUNT_WS_PORT`; scripts no longer default
  to 3000/8090/5470. Container-internal ports (3000 app, 5432 db) stay literal — they cannot collide on the host.

### Additional finding during Phase 2

- **F18**: the streaming server gateway serves **only WHEP** (`GET /<cam>`, `/<cam>/`, `/<cam>/index.m3u8` → 404 JSON;
  `GET /<cam>/whep` → 405). The thumbnail's iframe player fallback and the `<video>/<img>` GET-feed fallback can
  therefore never work. Worse, with no `playerUrl` the GET fallback fails and marks the tile "unavailable", which
  switches the WebRTC stream off. Fix: `playerUrl` = same-origin `/api/camera-feed/<cam>/whep` (as Nats_New) and the
  iframe block removed from `CameraThumbnail.tsx`.
- **F19**: WHEP health probes treated a refused token (401/403) as "live". Now 401/403 count as not live (app
  `streams.ts`, `absenceEngine.ts`; `sync-service`).

### Absence gate: before / after

`workers/sync-service/index.js`

```diff
-          map.set(String(row.name).toLowerCase(), String(row.ffmpeg || "").toLowerCase());
+        // Stream-status API: { streams: [{ name, online }] } -> "running" / "stopped".
+        streamStatusCache = { expiresAt: now + 5000, data: streamStatusMap(await res.json()) };
...
-    // Step 1: Camera Status Rule - check Streaming Server API ffmpeg status
-    const ffmpegStatus = await getCameraFfmpegStatus(rule.camera_id);
-    const isCameraRunning = String(ffmpegStatus).toLowerCase() === "running";
+    // Step 1: Camera Status Rule - Streaming Server stream-status `online` field
+    const streamStatus = await getCameraStreamStatus(rule.camera_id);
+    const isCameraRunning = streamStatus === "running";
```

`workers/sync-service/lib/stream-status.cjs` / `frontend/src/lib/server/pipelineUpstream.ts`:
`map.set(name.toLowerCase(), row.online === true ? "running" : "stopped")`

`frontend/src/lib/server/absenceEngine.ts`

```diff
-      const rows = Array.isArray(data) ? data : Array.isArray(data.rows) ? data.rows : [];
-      for (const row of rows) {
-        if (row.name) {
-          map.set(String(row.name).toLowerCase(), String(row.ffmpeg || "").toLowerCase());
-        }
-      }
+    // Stream-status API: { streams: [{ name, online }] } -> "running" / "stopped".
+    if (res.ok) return streamStatusMap(await res.json());
...
-  // 1. Camera Status Rule
+  // 1. Camera Status Rule (stream-status API `online` field)
   const camStatus = ... : await getCameraStreamStatus(opts.cameraName);
   if (camStatus.toLowerCase() !== "running") {   // unchanged comparison, value now from `online`
```

## 11. Unused duplicate top-level folders (left untouched by decision)

Not part of any build (`docker/Dockerfile` copies only `frontend/`; compose builds `workers/sync-service`,
`websocket/person-count-ws`, `websocket/luna-ws`). They still contain the old Basic-auth code and will show up in greps:

| folder | duplicate of |
|---|---|
| `alerts/` | `frontend/src/{components/alerts,lib/hooks,lib/store}` (older copies) |
| `apis/` | `frontend/src/app/api` (older copy) |
| `backend/` | `frontend/src/lib/server` + helpers (older copy, incl. `streams.ts`, `authenticatedFetch.ts`) |
| `maps/` | map components + map packages |
| `mediawall/` | media-wall components/hooks |
| `sync/sync-service/` | `workers/sync-service/` (byte-identical before this change) |
| `configs/` | `frontend/` config files, `configs/.env.example` (old copy of `.env.example`) |
| `database/init-db/` (used now), `migrations/init-db/`, `docker/docker/init-db/` | identical schema copies |

## 12. Open follow-ups (priority order)

1. **Port Nats_New's login** (`withAuth` roles on every API route incl. the pipeline proxies). Until then the
   dashboard's port (3002) must only be reachable on the LAN: anyone who reaches it can watch live video and
   detection frames through the server-held tokens.
2. Luna (owner decision needed, not changed): `NEXT_PUBLIC_LUNA_WS_URL=ws://localhost:8092` is baked into the client
   and breaks Luna live events from other PCs; `/api/runtime-config` sends `lunaAuthUser/lunaAuthPass` to browsers;
   `.env.example` Luna WS URL template contains credentials.
3. `cameraSnapshot.ts` (live camera snapshot fallback) cannot work with the new stream-status API (no `input_url`);
   decide whether to remove it or replace it with the WHEP stream.
4. `person-count-ws` broadcasts `detection_count` (all classes) as people count; correct today (model emits only
   `person`), would over-count if other classes are enabled.
5. Camera id case mismatches between stream names and detection camera ids (`server_room` / `Server_room`).
6. `streams.ts` / `stream-cameras` registry fallback still use a hardcoded map coordinate (`[73.0479, 33.7295]`) for
   cameras without a location (Nats_New removed this). Not an IP/secret; not changed.
7. Local mirror has no retention; it grows with the source (real-time) from the 1 h start point.
