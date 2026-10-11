# SafeCity AI Command Wall & Surveillance Dashboard

A unified, real-time SafeCity surveillance and command dashboard featuring offline vector maps, live camera grids with drag-and-drop media wall, automated YOLO detection alert engine, and full **VisionLabs Luna Platform 5** face and body recognition integration with movement tracing.

---

## ⚡ Quick Start: Run the Whole Project (Single Command)

From the project root (where `.env` and `docker-compose.yml` are), on the VM:

```bash
cp .env.example .env      # first time only: fill in every <placeholder>
docker compose up -d --build
```

The compose project is named **`combined`** and its containers are `combined-*`, so it never collides with
another dashboard on the same VM (e.g. the Nats_New dashboard's `safecity-db`, ports 3000/8090/5433).
Do not use `deploy.sh`/`repair-*.sh` on a VM that also runs other dashboards without reading them first.

Open **`http://<VM_IP>:3002/dashboard`** (`APP_PORT` in `.env`).

> **Security**: the dashboard has no sign-in yet. It proxies live video and detection frames with
> server-side tokens, so port `APP_PORT` must only be reachable on the LAN.

---

## 🐳 Docker Stack Architecture (What Runs in Containers)

| Service | Container Name | Port | Description |
| :--- | :--- | :--- | :--- |
| **`app`** | `combined-dashboard` | `APP_PORT` (3002) → 3000 | Next.js 16 dashboard, server-side APIs, pipeline proxies (WHEP, frame images) and Luna proxies |
| **`db`** | `combined-db` | `127.0.0.1:LOCAL_DB_PORT` (5370) → 5432 | This dashboard's own PostgreSQL 16 (volume `combined_db-data`, schema `database/init-db/`) |
| **`sync`** | `combined-sync` | *Internal* | Mirrors `detection_events` / `camera_locations` from the team DB (read-only role) and evaluates alert rules |
| **`person-count-ws`** | `combined-person-count-ws` | `PERSON_COUNT_WS_PORT` (8091) | WebSocket broadcasting live per-camera counts to the Media Wall |
| **`luna-ws`** | `safecity-luna-ws` | `LUNA_WS_PORT` (8092) | WebSocket relay for Luna events |

### Pipeline connections (all server-side; the browser never receives a token or upstream address)

| Upstream | `.env` keys | Auth |
| :--- | :--- | :--- |
| Stage 2 detection API (frame images, camera list) | `DETECTION_API_BASE_URL`, `DETECTION_API_TOKEN` | `Authorization: Bearer` |
| Streaming server stream-status API (camera list, camera online state) | `STREAMS_API_URL` (`/api/v1/stream-status`), `STREAMS_API_TOKEN` | `Authorization: Bearer` |
| Streaming server WHEP (live video, via `/api/camera-feed/<camera>/whep`) | `CAMERA_FEED_BASE_URL`, `CAMERA_FEED_TOKEN` | `Authorization: Bearer` |
| Team DB `yolo_events` | `TEAM_DATABASE_URL` (read-only role) | Postgres |

The stream-status key and the WHEP token are bound to this server's IP on the streaming server: re-issue
them there if the dashboard moves to another host.

---

## 🛠️ Management & Monitoring Commands

All commands are run from the project root:

```bash
docker compose ps                      # status
docker compose logs -f app             # web app
docker compose logs -f sync            # team DB -> local DB mirror
docker compose logs -f person-count-ws
docker compose logs -f luna-ws        # Luna WebSocket proxy
docker compose restart app             # after editing .env (non-NEXT_PUBLIC keys)
docker compose down                    # stop (keeps the database volume)
node --test 'tests/*.test.mjs'         # unit tests (Node 22.18+)
```

`docker compose down -v` deletes this dashboard's database volume (all local alerts and history). Only
use it on purpose. Postgres keeps the password the volume was first created with, so changing
`LOCAL_DB_PASSWORD` later needs `repair-db-password.sh` (targets `combined-db` only).

---

## 👤 VisionLabs Luna Platform 5 Integration

The left rail of the Command Wall dashboard (`15% width`) is dedicated to real-time face & body recognition events powered by **Luna Platform 5**:

### 1. Live Events Stream (Real-Time WebSocket)
- Connects automatically to `ws://localhost:8092/6/ws` via the `luna-ws` Docker container.
- Maintains a rolling buffer of the **50 latest events** in real time.
- Status indicator shows `LIVE (N/50)` with a pulsing indicator when active, or `STANDBY` during reconnection.

### 2. History Mode (Pagination & Full Filter Suite)
- **Pagination**: Navigate historical detections across pages (`page=1`, `page=2`, etc.) with customizable page size (`10`, `20`, `50`, `100` items/page).
- **Smart Gender & Body Detection Filtering**:
  - In Luna Platform 5, face detections use `gender: 1` (Male) / `0` (Female).
  - Body detections (full-body crops from surveillance cameras) use `body_basic_attributes.apparent_gender: 1` (Male) / `0` (Female).
  - The dashboard automatically bridges and queries `apparent_gender` so that filtering for "Male" or "Female" accurately retrieves body detection events from surveillance footage.
- **Similarity Match Tiers**:
  - 🟢 **80% to 100%**: High Match (Solid **Green** card outline)
  - 🟡 **60% to 79%**: Medium Match (Solid **Yellow** card outline)
  - 🔴 **0% to 59%**: Low Match / Unregistered Stranger (Solid **Red** card outline)
- **One-Click Quick Filter Dots (`🔴 🟢 🟡`)**:
  - Quick filter buttons on the rail header to toggle similarity tiers with a single click.
- **Glassmorphic Filter Drawer (Framer Motion)**:
  - Slide-in drawer with dual-thumb similarity percentage slider, handler/camera picker, watchlist matcher, age range, clothing color/garment filters, and custom time ranges.

### 3. Event Cards (`LunaEventCard.tsx`) & Full-View Lightbox
- **Dual Photo Layout**:
  - **Main Detection Image**: Large, crisp crop of the detected person.
  - **Overlapping Match Image**: Smaller reference avatar thumbnail at the top-right corner of the detection image.
- **Full-Screen Lightbox Modal**:
  - Clicking on **either** the detected photo or the match photo opens a full-screen high-resolution modal with image zoom, title, camera source, timestamp, and close button.
- **Streamlined Metadata**:
  - Shows person name/identity, source camera name, watchlist/detection class, and formatted date & time.
- **Movement Trace Modal (`FaceMovementTraceModal.tsx`)**:
  - Clicking the **Trace** (`➤`) button opens an interactive chronological timeline showing the person's journey across camera nodes, timestamps, and detection crops, with CSV export.

### 4. Luna Backend Proxies
To bypass CORS and handle Luna authentication securely, the dashboard provides server-side reverse proxy routes:
- `GET /api/luna/events` - Queries Luna events with URL filter parameters.
- `GET /api/luna/lists` - Fetches watchlists.
- `GET /api/luna/handlers` - Fetches active streams and camera handlers.
- `GET /api/luna/images/[...path]` - Proxies Luna JPEG detection crops (`/6/images/...`).
- `GET /api/luna/samples/[sampleId]` - Proxies Luna face/body sample crops (`/6/samples/...`).
- `GET /api/luna/faces/[faceId]` - Fetches registered face metadata and reference avatars.

---

## 🚨 Alerts & YOLO Detection Engine

- **Rule Creation**: Set up alert rules with specific camera, severity category, latest frame reference, drawn polygon/ROI, trigger direction, and YOLO detection classes.
- **Dynamic YOLO Classes**: Automatically populated from `GET /api/cameras/:cameraId/classes` based on recent detections (e.g. `person`, `car`, `truck`, `motorcycle`).
- **Absence / No-Person Rules**: Rules can trigger when an area is left empty (`condition = "absence"`).
- **Automated Worker Evaluation**: The `sync` worker continuously checks incoming detections against active rules, inserts `alert_events`, tracks unread states, and closes absence events.
- **Severity Categories**: Displayed in the UI as **Low**, **Medium**, and **High**.

---

## 📺 Media Wall Module

- **Layout Options**: `2x2`, `3x3`, and `4x4` dynamic camera grids.
- **Drag-and-Drop**: Reorder and assign cameras to cells using `@dnd-kit/core`.
- **Saved Configurations**: Layouts and cell assignments are automatically saved in browser local storage.
- **Live Occupancy**: Displays live person counts for each camera stream streamed over the `person-count-ws` WebSocket.

---

## 🗺️ Offline Vector Maps Module

The map system operates 100% offline without external internet or third-party tile server dependencies:
- **Offline PMTiles**: Islamabad & Rawalpindi street and satellite vector tiles stored under `frontend/public/maps/`.
- **Local Font Glyphs**: Served locally from `frontend/public/map-fonts/`.
- **MapLibre GL Integration**: Offline styles located in `frontend/src/components/map/mapStyles.ts`.

---

## 🗄️ Database Ownership & Synchronization

- **Local DB (`db`)**: Dashboard's source of truth for:
  - `alerts` & `alert_events`
  - `absence_events`
  - `sync_cursors`
  - Enriched `camera_locations` (geographic coordinates and map regions)
- **Team DB (External Source of Truth)**:
  - `detection_events` (YOLO detection logs)
  - Baseline `camera_locations`
- **Sync Mechanism**:
  - The `sync` service pulls new detection events incrementally using `id` cursors stored in `sync_cursors`,
    polling every `SYNC_POLL_MS` (real time).
  - **New deployment only** (no cursor saved yet): with `SYNC_BACKFILL_HOURS=1` it copies just the last hour of
    source history instead of all of it, then saves the cursor. Every later start resumes from that cursor.
  - The team DB connection uses a read-only role (`dashboard_sync`); the dashboard never writes to it.
  - Uses PostgreSQL advisory locks and `UNIQUE(alert_id, event_id)` constraints to ensure idempotent processing without duplicate alert triggers.

---

## ⚙️ Environment Variables Reference (`.env`)

Configure your `.env` file in the project root:

```env
# ── Local Database (this dashboard's own; new random password) ───────────────
LOCAL_DB_USER=dashboard
LOCAL_DB_PASSWORD=<openssl rand -hex 24>
LOCAL_DB_NAME=dashboard
LOCAL_DB_PORT=5370
DATABASE_URL=postgres://dashboard:<same password>@127.0.0.1:5370/dashboard

# ── Team Database (Read-Only YOLO Events) ────────────────────────────────────
TEAM_DATABASE_URL=postgres://<read-only role>:<password>@<team-db-host>:15432/yolo_events

# ── Pipeline (server-side only) ──────────────────────────────────────────────
DETECTION_API_BASE_URL=http://<pipeline-host>:18088
DETECTION_API_TOKEN=<token>
STREAMS_API_URL=http://<pipeline-host>:8000/api/v1/stream-status
STREAMS_API_TOKEN=<stream-status developer API key>
CAMERA_FEED_BASE_URL=http://<pipeline-host>:8889
CAMERA_FEED_TOKEN=<WHEP bearer token>

# ── Web App & Ports ──────────────────────────────────────────────────────────
APP_PORT=3002
PERSON_COUNT_WS_PORT=8091
PERSON_COUNT_WS_URL=ws://<VM_IP>:8091

# ── VisionLabs Luna Platform 5 Config ────────────────────────────────────────
LUNA_HOST=<your-luna-server-ip>
LUNA_API_PORT=5000
LUNA_ACCOUNT_ID=<luna-account-uuid>
LUNA_AUTH_USER=<luna-username>
LUNA_AUTH_PASS=<luna-password>
LUNA_WS_PORT=8092
NEXT_PUBLIC_LUNA_WS_URL=ws://localhost:8092

# ── Background Sync Worker ───────────────────────────────────────────────────
SYNC_BACKFILL_HOURS=1
SYNC_POLL_MS=1000
SYNC_BATCH_LIMIT=2000
SYNC_RECONCILE_MS=60000
```

---

## ❓ Common Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `connect ECONNREFUSED 127.0.0.1:5370` | Local PostgreSQL container is stopped or still initializing. | Run `docker compose up -d db` and wait 5 seconds. |
| `Alert API offline` in UI | Web app cannot communicate with local DB. | Verify `DATABASE_URL` matches `LOCAL_DB_USER`, `LOCAL_DB_PASSWORD`, and `LOCAL_DB_PORT`. |
| No events in Luna History | Luna server unreachable or network route down. | Check connection: `docker compose ... logs luna-ws` and verify `LUNA_HOST` in `.env`. |
| Port already in use (`3000` or `5370`) | A local Node process or another Docker container is using the port. | Change `APP_PORT=3002` in `.env` or stop conflicting services. |
