# New Dashboard Module Bundle

This folder is a portable extraction of the current dashboard modules for a new single-page dashboard project. It contains the functional source, APIs, local database schema, sync workers, WebSocket service, Docker/deployment configs, and offline map assets.

## Folder Map

- `frontend/` - runnable Next app source copied from the current dashboard, including `src/`, `public/`, package manifests, and framework configs.
- `backend/` - server-side stores/connectors used by API routes, including Postgres access and alert/camera/event stores.
- `apis/` - all Next API route handlers plus `API_REFERENCE.md`.
- `websocket/` - `person-count-ws`, the standalone WebSocket service for live person counts.
- `database/` - local Postgres schema/init SQL.
- `migrations/` - same ordered SQL migration/init files for reuse in another migration runner.
- `workers/` - background sync/alert evaluation worker copy.
- `sync/` - sync-service copy with its package manifest and Dockerfile.
- `maps/` - complete offline Islamabad + Rawalpindi map module: PMTiles, GeoJSON, glyphs, standalone map packages, map React components, and camera icon asset.
- `mediawall/` - media wall page, drag/drop components, live camera hooks, occupancy WebSocket client, and persisted layout store.
- `alerts/` - alert page/components/hooks/services for rule creation, dynamic detection classes, absence alerts, lifecycle UI, seen/delete/status handling.
- `docker/` - Dockerfile, compose file, init DB mount, deployment docs, and runtime scripts.
- `configs/` - copied config, env example, scripts, and docs.
- `.env` / `.env.example` - placeholder runtime configuration. Update these values for the next project.

## Offline Map Module

The dashboard map is fully offline for tiles and labels:

- Runtime style code: `maps/components/mapStyles.ts`
- Map component: `maps/components/CameraLocationMap.tsx`
- App page: `maps/page/page.tsx`
- Browser-served PMTiles: `maps/public-maps/*.pmtiles`
- Browser-served glyphs: `maps/map-fonts/Noto Sans Regular/*.pbf`
- Standalone packages: `maps/islamabad_map_package/` and `maps/rawalpindi_map_package/`
- Saved map regions seed: `maps/data/map-regions.json` and `frontend/data/map-regions.json`

The MapLibre style uses local URLs only:

```text
pmtiles:///maps/islamabad.pmtiles
pmtiles:///maps/islamabad-satellite.pmtiles
pmtiles:///maps/rawalpindi.pmtiles
pmtiles:///maps/rawalpindi-satellite.pmtiles
/map-fonts/{fontstack}/{range}.pbf
```

For a runnable Next app, keep the same assets under `frontend/public/maps` and `frontend/public/map-fonts`.

## Alerts Module

Alert rule creation lives in:

- `alerts/components/CreateAlertModal.tsx`
- `alerts/components/RegionDrawCanvas.tsx`
- `alerts/alertConditions.ts`
- `alerts/detectionBoxes.ts`
- `alerts/useAlertRules.ts`
- `backend/server/alertsStore.ts`
- `apis/api/alerts/**`

Supported lifecycle:

- Create alert rule with camera, category, latest frame, drawn ROI, trigger direction, and selected detection classes.
- Dynamic classes are loaded from `GET /api/cameras/:cameraId/classes`, which reads recent `detection_events.detections_json`; future YOLO classes appear automatically.
- Absence/no-person rules use `conditions.condition = "absence"` and optional restricted ROI.
- Server-side worker `sync/sync-service/index.js` evaluates region and absence rules continuously, inserts `alert_events`, opens/closes `absence_events`, and updates alert latest/unseen state.
- UI/API supports list, detail, mark seen/unseen, status patch, delete, event history, and absence history/summary.

Category note: the current code stores the top severity internally as `critical` for DB/backward compatibility, but the extracted UI displays it as `High`, so operators see Low, Medium, and High.

## Media Wall Module

Media wall source is in:

- `mediawall/page/page.tsx`
- `mediawall/components/*`
- `mediawall/useCameras.ts`
- `mediawall/useLiveCameraOccupancy.ts`
- `mediawall/allCamerasFeed.ts`
- `mediawall/useUIStore.ts`

Features included:

- Camera grid with `2x2`, `3x3`, and `4x4` layouts.
- Right-side camera library.
- Drag-and-drop camera placement via `@dnd-kit/core`.
- Layout and assignments persisted in browser local storage under `safecity-ui-store`.
- Live frames via `/api/stream-cameras` and `/api/camera-feed/:cameraName`.
- Current frame person count display from the shared person-count WebSocket.

The live occupancy text is rendered in the media-wall cell components using the `livePeopleCount` prop, for example: `Current frame contains X persons`.

## WebSocket Service

Server:

- `websocket/person-count-ws/index.js`

Client:

- `frontend/src/lib/allCamerasFeed.ts`
- `frontend/src/lib/hooks/useLiveCameraOccupancy.ts`

Event shape:

```json
{
  "type": "people_count",
  "camera_id": "CAM-01",
  "camera_name": "Gate Camera",
  "zone": "Entrance",
  "people_count": 3,
  "event_id": "event-uuid",
  "time": "2026-09-24T10:00:00.000Z"
}
```

Reconnect behavior is client-side in `allCamerasFeed.ts`: one shared browser socket, 5 second reconnect delay, connection status broadcasts, JSON parse protection, and close/error handling.

## Database Ownership

Local DB is this dashboard's source of truth for:

- `alerts`
- `alert_events`
- `absence_events`
- `sync_cursors`
- locally enriched `camera_locations` fields such as map coordinates
- saved map regions in `data/map-regions.json`

Team DB is source of truth for:

- `detection_events`
- `camera_locations` baseline registry

Sync rules:

- `detection_events` are pulled incrementally by source `id`.
- `camera_locations` are refreshed/upserted from Team DB on each sync poll.
- local rows backed only by detection events are retained when Team DB registry is incomplete.
- `alerts` and `alert_events` are not pulled from Team DB in the current worker; this dashboard owns them locally.
- Sync cursor is stored in `sync_cursors`.
- Default intervals: `SYNC_POLL_MS=3000`, `SYNC_RECONCILE_MS=60000`.
- Conflict handling uses upserts. Local alert event insertion is idempotent by `UNIQUE(alert_id, event_id)` plus an advisory lock.

## Environment

Update `newdashboard/.env` for the next project. Important variables:

- `DATABASE_URL` - this dashboard's local Postgres.
- `TEAM_DATABASE_URL` - read-only Team DB.
- `DETECTION_API_BASE_URL` - detection backend proxied by `/api/ai`.
- `STREAMS_API_URL`, `STREAMS_API_USERNAME`, `STREAMS_API_PASSWORD` - stream camera list.
- `CAMERA_FEED_BASE_URL`, `CAMERA_FEED_USERNAME`, `CAMERA_FEED_PASSWORD` - live frame proxy.
- `PERSON_COUNT_WS_URL`, `PERSON_COUNT_WS_PORT` - person-count WebSocket.
- `SYNC_*` - sync worker intervals/batch sizes.
- `RAW_IMAGE_RETENTION_TARGET` - camera retention metric.

## Running In A New Project

1. Copy or move the contents of `frontend/` into the new app root, or keep this bundle and run from `frontend/`.
2. Ensure `frontend/public/maps` and `frontend/public/map-fonts` are present for offline map rendering.
3. Create the local DB using `database/init-db/*.sql` in numeric order.
4. Configure `.env`.
5. Start the app, sync worker, and WebSocket service:

```bash
npm install
npm run dev
npm run sync
npm run ws
```

For Docker, use `docker/docker-compose.yml` and `docker/Dockerfile` as the base deployment setup.

## Local Run And Team DB Sync

Use this section when you want your local dashboard DB to sync from the team `yolo_events` DB and then create alerts from the UI.

### What Runs Where

- Team DB: source of truth for `detection_events` and baseline `camera_locations`.
- Local DB service `db`: this dashboard's own Postgres. Alerts are created here.
- Sync worker service `sync`: pulls team `detection_events` / `camera_locations` into local DB and evaluates active alert rules.
- WebSocket service `person-count-ws`: reads local `detection_events` and broadcasts live people counts.
- Dashboard app: reads local DB and stream/camera APIs.

### Required `.env` Shape

Make sure these values agree with each other:

```env
LOCAL_DB_USER=dashboard
LOCAL_DB_PASSWORD=admin
LOCAL_DB_NAME=dashboard
LOCAL_DB_PORT=5370
DATABASE_URL=postgres://dashboard:admin@localhost:5370/dashboard
TEAM_DATABASE_URL=postgres://...
PERSON_COUNT_WS_PORT=8090
PERSON_COUNT_WS_URL=ws://localhost:8090
```

If you open the dashboard from another machine on the network, set `PERSON_COUNT_WS_URL` to that machine's reachable host/IP instead of `localhost`.

### Option A: Full Docker Stack

Run from `D:\newdashboard`:

```powershell
docker compose --env-file .env -f docker\docker-compose.yml up -d --build
```

Check status:

```powershell
docker compose --env-file .env -f docker\docker-compose.yml ps
```

Watch team DB sync:

```powershell
docker compose --env-file .env -f docker\docker-compose.yml logs -f sync
```

Open the dashboard:

```text
http://localhost:3000/dashboard
```

### Option B: Docker DB/Sync, Next.js On Host

This is best while editing UI code.

Start only DB, sync worker, and people-count WebSocket:

```powershell
docker compose --env-file .env -f docker\docker-compose.yml up -d --build db sync person-count-ws
```

Run Next.js locally:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Next.js, usually:

```text
http://localhost:3000/dashboard
```

If port 3000 is busy, Next.js will choose another port like `3002`.

### Verify APIs

From PowerShell:

```powershell
Invoke-WebRequest http://localhost:3000/api/runtime-config -UseBasicParsing
Invoke-WebRequest http://localhost:3000/api/stream-cameras -UseBasicParsing
Invoke-WebRequest http://localhost:3000/api/alerts?limit=5 -UseBasicParsing
Invoke-WebRequest http://localhost:3000/api/stats -UseBasicParsing
```

If you are running host Next.js on port 3002, replace `3000` with `3002`.

### Verify Sync Data

Open local Postgres:

```powershell
docker compose --env-file .env -f docker\docker-compose.yml exec db psql -U dashboard -d dashboard
```

Useful checks:

```sql
SELECT * FROM sync_cursors;
SELECT COUNT(*) FROM detection_events;
SELECT COUNT(*) FROM camera_locations;
SELECT COUNT(*) FROM alerts;
SELECT COUNT(*) FROM alert_events;
```

Recent synced detection rows:

```sql
SELECT id, event_id, camera_id, detection_ts, detection_count
FROM detection_events
ORDER BY id DESC
LIMIT 10;
```

### Common Issues

`connect ECONNREFUSED 127.0.0.1:5370`

Local DB is not running or `LOCAL_DB_PORT` / `DATABASE_URL` do not match. Start it:

```powershell
docker compose --env-file .env -f docker\docker-compose.yml up -d db
```

`Alert API offline` in the right panel

The dashboard rendered, but `/api/alerts` could not reach local DB. Check:

```powershell
docker compose --env-file .env -f docker\docker-compose.yml ps db
docker compose --env-file .env -f docker\docker-compose.yml logs db
```

No detections / empty camera stats

The sync worker may not be able to reach `TEAM_DATABASE_URL`. Check:

```powershell
docker compose --env-file .env -f docker\docker-compose.yml logs -f sync
```

If the team DB was down earlier, leave `sync` running; it resumes from `sync_cursors` and catches up in batches.

Reset local DB only when you intentionally want to delete local alerts/history:

```powershell
docker compose --env-file .env -f docker\docker-compose.yml down -v
```

Then start again with `up -d --build`.


## Important: Run Docker Commands From The Right Folder

The root `.env` and compose file live in `D:\newdashboard`, not in `D:\newdashboard\frontend`.

If your PowerShell prompt is this:

```powershell
PS D:\newdashboard\frontend>
```

then first go back to the project root:

```powershell
cd ..
```

Then run Docker commands from:

```powershell
PS D:\newdashboard>
```

Correct commands from project root:

```powershell
docker compose --env-file .env -f docker\docker-compose.yml up -d --build db sync person-count-ws
docker compose --env-file .env -f docker\docker-compose.yml ps
docker compose --env-file .env -f docker\docker-compose.yml logs -f sync
```

If you intentionally want to stay inside `frontend`, use parent paths:

```powershell
docker compose --env-file ..\.env -f ..\docker\docker-compose.yml up -d --build db sync person-count-ws
docker compose --env-file ..\.env -f ..\docker\docker-compose.yml ps
docker compose --env-file ..\.env -f ..\docker\docker-compose.yml logs -f sync
```

Do not run this from `frontend`:

```powershell
docker compose --env-file .env -f docker\docker-compose.yml up -d db
```

That command looks for `D:\newdashboard\frontend\.env`, which does not exist.

If Docker Desktop says Engine running but every `docker version` or `docker compose ps` command hangs, restart Docker Desktop from the tray icon, then run:

```powershell
docker context use desktop-linux
docker version
docker compose --env-file .env -f docker\docker-compose.yml ps
```
