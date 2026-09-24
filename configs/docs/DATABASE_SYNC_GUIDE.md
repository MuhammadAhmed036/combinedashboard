# Database and Sync Guide

This document explains why camera tiles can show database/alert state, how the
sync service recovers, how often it polls, what is required when changing the
team database in `.env`, and exactly which team DB columns are copied into this
app's local database.

## 1. Two Databases Are Used

This project uses two different Postgres connections:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | This app's own local Postgres database. The dashboard, API routes, sync service, and person-count WebSocket read/write here. |
| `TEAM_DATABASE_URL` | The team's shared `yolo_events` database. The sync service reads from this DB and copies selected data into the local DB. |

In local development, `.env` usually points `DATABASE_URL` to:

```env
DATABASE_URL=postgres://dashboard:<LOCAL_DB_PASSWORD>@localhost:5433/dashboard
```

Under Docker Compose, the app/sync/ws containers override that to the internal
Docker hostname:

```env
DATABASE_URL=postgres://dashboard:<LOCAL_DB_PASSWORD>@db:5432/dashboard
```

## 2. Auto-Recovery and Error State Timing

### Local Postgres Container

`docker-compose.yml` configures the local DB service with:

```yaml
restart: unless-stopped
healthcheck:
  interval: 5s
  timeout: 5s
  retries: 20
```

Meaning:

| Situation | What happens |
|---|---|
| DB process/container crashes | Docker tries to restart it automatically because `restart: unless-stopped` is set. |
| DB becomes unhealthy | Healthcheck runs every 5 seconds. After 20 failed checks, Docker marks it unhealthy, roughly after 100 seconds. |
| Docker Desktop is stopped | Nothing auto-recovers until Docker Desktop/service is started again. |
| `DATABASE_URL` is wrong | The app cannot fix this automatically. `.env` must be corrected and services restarted. |

### Dashboard Error Banner

The dashboard backend status banner checks `/api/stats` when the layout mounts.
It does not currently auto-retry on a timer. It retries when the user clicks
`Retry`, or when the page reloads/remounts.

### Sync Service

If the sync service is already running and a per-table poll fails, it logs the
error and retries on the next poll.

If sync fails during startup before the polling loop begins, the Node process
exits. In Docker Compose, `restart: unless-stopped` starts it again. If running
manually with `npm run sync`, you must start it again yourself.

Idle Postgres connection errors are logged. The next query uses a fresh pool
connection.

## 3. Sync Poll Timings

The sync service is `sync-service/index.js`.

| Setting | Default | Meaning |
|---|---:|---|
| `SYNC_POLL_MS` | `3000` ms | Main poll loop delay. After each loop finishes, the next loop starts 3 seconds later. |
| `SYNC_RECONCILE_MS` | `60000` ms | Raw image status reconciliation delay. Runs every 60 seconds. |
| `SYNC_BATCH_LIMIT` | `2000` rows | Maximum new `detection_events` rows copied per detection poll. |
| `SYNC_RECONCILE_LIMIT` | `5000` rows | Maximum open image-status rows checked during reconciliation. |

Every main poll loop runs these tasks:

1. Copy new `detection_events` rows from team DB into local DB.
2. Copy/sync `camera_locations` from team DB into local DB.
3. Evaluate local no-person/absence rules.

Important details:

| Table | Sync behavior |
|---|---|
| `detection_events` | Incremental. It copies rows where team `id` is greater than the saved local cursor. |
| `camera_locations` | Full refresh each poll. It reads all team camera rows, upserts them locally, and removes local camera rows that no longer exist in team DB. |
| `alerts` | Current code does not sync this table from team DB. Local alerts are managed locally. |
| `alert_events` | Current code does not sync this table from team DB. Local alert events are generated locally. |

## 4. What Is Required for a New Team DB

If tomorrow you want to use a new team DB, update `.env`:

```env
TEAM_DATABASE_URL=postgres://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:<DB_PORT>/yolo_events
```

You need these details from whoever owns the team DB:

| Required value | Example |
|---|---|
| DB host/IP | `192.168.18.205` |
| DB port | `15432` or `5432` |
| DB name | `yolo_events` |
| Username | read-only user preferred |
| Password | password for that user |
| Network access | The app machine/container must be able to reach the host/port. |

Minimum permissions needed on the team DB:

```sql
GRANT CONNECT ON DATABASE yolo_events TO <DB_USER>;
GRANT USAGE ON SCHEMA public TO <DB_USER>;
GRANT SELECT ON detection_events TO <DB_USER>;
GRANT SELECT ON camera_locations TO <DB_USER>;
```

If future code re-enables team alert sync, also grant:

```sql
GRANT SELECT ON alerts TO <DB_USER>;
GRANT SELECT ON alert_events TO <DB_USER>;
```

After changing `.env`, restart the relevant process:

```bash
npm run sync
```

Or, if using Docker Compose:

```bash
docker compose up -d --force-recreate sync
```

## 5. What Is Required for This App's Own Local DB

If you use the included Docker DB, you only need to set:

```env
LOCAL_DB_USER=dashboard
LOCAL_DB_PASSWORD=<strong_password>
LOCAL_DB_NAME=dashboard
LOCAL_DB_PORT=5433
DATABASE_URL=postgres://dashboard:<strong_password>@localhost:5433/dashboard
```

The local schema is created by the SQL files in `docker/init-db/` when the
Postgres volume is initialized for the first time.

If you use your own external/local Postgres instead of the included Docker DB,
you must provide:

| Required value | Used by |
|---|---|
| Host/IP | `DATABASE_URL` |
| Port | `DATABASE_URL` |
| DB name | `DATABASE_URL` |
| Username | `DATABASE_URL` |
| Password | `DATABASE_URL` |
| Existing schema | Tables listed in section 6 must exist. |

The local DB user must be able to:

```sql
SELECT, INSERT, UPDATE, DELETE
```

on these local tables:

- `detection_events`
- `camera_locations`
- `alerts`
- `alert_events`
- `sync_cursors`

## 6. Columns Pulled From Team DB

### `detection_events`

The sync service pulls these columns from the team DB:

| Column |
|---|
| `id` |
| `event_id` |
| `camera_id` |
| `camera_ip` |
| `zone` |
| `scene` |
| `detection_ts` |
| `model_name` |
| `backend` |
| `device` |
| `image_width` |
| `image_height` |
| `detection_count` |
| `decode_ms` |
| `preprocess_ms` |
| `inference_ms` |
| `postprocess_ms` |
| `total_ms` |
| `detections_json` |
| `raw_image_path` |
| `raw_image_status` |
| `worker_id` |
| `created_at` |

### `camera_locations`

The sync service pulls these columns from the team DB:

| Column |
|---|
| `id` |
| `camera_id` |
| `camera_name` |
| `camera_ip` |
| `zone` |
| `scene` |
| `latitude` |
| `longitude` |
| `heading_degrees` |
| `address` |
| `building` |
| `floor` |
| `description` |
| `enabled` |
| `metadata` |
| `created_by` |
| `created_at` |
| `updated_at` |

### Alert Tables

The current running sync logic does not pull `alerts` or `alert_events` from
the team DB. Local alert rules and local alert history are owned by this app.

The local alert engine writes into:

- `alerts`
- `alert_events`

## 7. Quick Commands

Start local DB:

```bash
docker compose up -d db
```

Check local DB status:

```bash
docker compose ps db
```

Run sync manually:

```bash
npm run sync
```

Run sync through Docker:

```bash
docker compose up -d sync
```

View sync logs:

```bash
docker compose logs sync --tail=100 -f
```

## 8. Current Media Wall Alert Note

Media Wall red border and `ALERT` badge are now based only on live occupancy:

```text
livePeopleCount >= 5
```

Having an active alert rule on a camera no longer makes the Media Wall tile red
by itself.

