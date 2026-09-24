# Running Locally

This guide is for running the whole project locally from `D:\new projects nats`.

## 1. Fill `.env`

Open `.env` and replace every `<...>` placeholder.

Required external values:

| Variable | Value to put |
|---|---|
| `DETECTION_API_BASE_URL` | AI/detection backend, for example `http://192.168.10.10:18088` |
| `STREAMS_API_URL` | Camera list API, for example `http://192.168.10.10:8000/api/streams/list` |
| `STREAMS_API_USERNAME` / `STREAMS_API_PASSWORD` | Camera list credentials |
| `CAMERA_FEED_BASE_URL` | Live camera feed relay, for example `http://192.168.10.10:8889` |
| `CAMERA_FEED_USERNAME` / `CAMERA_FEED_PASSWORD` | Camera feed credentials |
| `LOCAL_DB_PASSWORD` | Password for this project's own local Postgres container |
| `TEAM_DATABASE_URL` | Team shared `yolo_events` Postgres URL |
| `PERSON_COUNT_WS_URL` | Browser websocket URL, for example `ws://localhost:8090` or `ws://192.168.10.10:8090` |

Local DB defaults:

```env
LOCAL_DB_USER=dashboard
LOCAL_DB_NAME=dashboard
LOCAL_DB_PORT=5433
DATABASE_URL=postgres://dashboard:<LOCAL_DB_PASSWORD>@localhost:5433/dashboard
```

Use the same password in `LOCAL_DB_PASSWORD` and `DATABASE_URL`.

## 2. Recommended: run everything with Docker

Build the three project images:

```powershell
docker build -t safecity-ai-dashboard:0.1.0 .
docker build -t safecity-person-count-ws:0.1.0 .\person-count-ws
docker build -t safecity-sync:0.1.0 .\sync-service
```

Start the full stack:

```powershell
docker compose up -d
```

Check status:

```powershell
docker compose ps
docker compose logs -f sync
```

Open:

```text
http://localhost:3000
```

If you set `APP_PORT=3001`, open:

```text
http://localhost:3001
```

## 3. Alternative: run Next.js on host, DB/services in Docker

Start only the backend services:

```powershell
docker compose up -d db person-count-ws sync
```

Run the dashboard locally:

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## 4. Verify browser-closed alerts

Keep backend services running, then close all browser tabs.

Watch the backend evaluator:

```powershell
docker compose logs -f sync
```

If the service was stopped for a while, it catches up from the Team DB in
multiple batches per poll. Tune this with `SYNC_BATCH_LIMIT` and
`SYNC_MAX_BATCHES_PER_POLL` in `.env`.

Check alert events in local DB:

```powershell
docker compose exec db psql -U dashboard -d dashboard
```

Inside `psql`:

```sql
SELECT alert_id, event_id, camera_id, created_by, created_at
FROM alert_events
ORDER BY created_at DESC
LIMIT 20;
```

Events created by the backend should show:

```text
server-detection-engine
```

## 5. Check duplicate alerts

Inside `psql`:

```sql
SELECT alert_id, event_id, COUNT(*) AS duplicate_count
FROM alert_events
GROUP BY alert_id, event_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

Expected result for future data:

```text
0 rows
```

Historical duplicates may still exist if they were inserted before the fix. New duplicates are blocked.

## 6. Useful commands

Restart only the backend evaluator:

```powershell
docker compose restart sync
```

Restart the whole stack:

```powershell
docker compose restart
```

Stop everything:

```powershell
docker compose down
```

Stop everything but keep database data:

```powershell
docker compose down
```

Delete local DB data too:

```powershell
docker compose down -v
```

Only use `down -v` when you intentionally want to delete local database history.

## 7. Important behavior

The browser is display-only for alert generation.

Alerts continue while the browser is closed if these are running:

```text
db
sync
app
person-count-ws
```

The main service for 24/7 alert generation is:

```text
sync
```

If Docker or the machine is shut down, alert generation stops until services start again.
