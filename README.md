# SafeCity AI Command Wall & Surveillance Dashboard

A unified, real-time SafeCity surveillance and command dashboard featuring offline vector maps, live camera grids with drag-and-drop media wall, automated YOLO detection alert engine, and full **VisionLabs Luna Platform 5** face and body recognition integration with movement tracing.

---

## ⚡ Quick Start: Run the Whole Project (Single Command)

To run the entire system — including the database, dashboard application, sync worker, and all WebSocket services — open your terminal in the project root (`D:\newdashboard`) and run:

```powershell
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
```

> **Important**: Always run this command from the project root (`D:\newdashboard`), where `.env` and `docker/` reside.

Once started, open your browser and navigate to:
👉 **[http://localhost:3002/dashboard](http://localhost:3002/dashboard)** (or `http://localhost:3000/dashboard` depending on `APP_PORT` in your `.env`)

---

## 🐳 Docker Stack Architecture (What Runs in Containers)

The entire system is orchestrated with Docker Compose into 5 interconnected services:

| Service | Container Name | Port | Description |
| :--- | :--- | :--- | :--- |
| **`app`** | `safecity-newdashboard-app-1` | `3002:3000` | Next.js 16 (Turbopack) dashboard web app, server-side APIs, and Luna reverse proxies |
| **`db`** | `safecity-newdashboard-db-1` | `5370:5432` | Local PostgreSQL 16 database storing alerts, rules, locations, and synced detection events |
| **`sync`** | `safecity-newdashboard-sync-1` | *Internal* | Background worker that polls Team DB for YOLO detections, updates cursors, and triggers alerts |
| **`person-count-ws`** | `safecity-newdashboard-person-count-ws-1` | `8091:8090` | Node.js WebSocket broadcasting real-time person counts per camera to the Media Wall |
| **`luna-ws`** | `safecity-newdashboard-luna-ws-1` | `8092:8092` | High-performance Node.js WebSocket proxy relaying live face/body recognition events from Luna |

---

## 🛠️ Management & Monitoring Commands

All commands are run from `D:\newdashboard`:

- **Check status of all running containers**:
  ```powershell
  docker compose --env-file .env -f docker/docker-compose.yml ps
  ```

- **View live logs of a specific service**:
  ```powershell
  # Next.js web application
  docker compose --env-file .env -f docker/docker-compose.yml logs -f app

  # Luna WebSocket proxy
  docker compose --env-file .env -f docker/docker-compose.yml logs -f luna-ws

  # Sync worker (Team DB -> Local DB)
  docker compose --env-file .env -f docker/docker-compose.yml logs -f sync
  ```

- **Restart a single service (e.g. after editing frontend code)**:
  ```powershell
  docker compose --env-file .env -f docker/docker-compose.yml restart app
  ```

- **Stop the entire project**:
  ```powershell
  docker compose --env-file .env -f docker/docker-compose.yml down
  ```

- **Reset local database and rebuild from scratch**:
  ```powershell
  docker compose --env-file .env -f docker/docker-compose.yml down -v
  docker compose --env-file .env -f docker/docker-composl up -d --build
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
  - The `sync` service pulls new detection events incrementally using `id` cursors stored in `sync_cursors`.
  - Uses PostgreSQL advisory locks and `UNIQUE(alert_id, event_id)` constraints to ensure idempotent processing without duplicate alert triggers.

---

## ⚙️ Environment Variables Reference (`.env`)

Configure your `.env` file in the project root:

```env
# ── Local Database ───────────────────────────────────────────────────────────
LOCAL_DB_USER=dashboard
LOCAL_DB_PASSWORD=admin
LOCAL_DB_NAME=dashboard
LOCAL_DB_PORT=5370
DATABASE_URL=postgres://dashboard:admin@localhost:5370/dashboard

# ── Team Database (Read-Only YOLO Events) ────────────────────────────────────
TEAM_DATABASE_URL=postgres://user:password@team-db-host:5432/yolo_events

# ── Web App & Ports ──────────────────────────────────────────────────────────
APP_PORT=3002
PERSON_COUNT_WS_PORT=8091
PERSON_COUNT_WS_URL=ws://localhost:8091

# ── VisionLabs Luna Platform 5 Config ────────────────────────────────────────
LUNA_HOST=192.168.18.71
LUNA_API_PORT=5000
LUNA_ACCOUNT_ID=00000000-0000-4000-b000-000000000146
LUNA_AUTH_USER=root@visionlabs.ai
LUNA_AUTH_PASS=root
LUNA_WS_PORT=8092
NEXT_PUBLIC_LUNA_WS_URL=ws://localhost:8092

# ── Background Sync Worker ───────────────────────────────────────────────────
SYNC_POLL_MS=1000
SYNC_BATCH_SIZE=2000
SYNC_RECONCILE_MS=60000
```

---

## ❓ Common Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `connect ECONNREFUSED 127.0.0.1:5370` | Local PostgreSQL container is stopped or still initializing. | Run `docker compose --env-file .env -f docker/docker-compose.yml up -d db` and wait 5 seconds. |
| `Alert API offline` in UI | Web app cannot communicate with local DB. | Verify `DATABASE_URL` matches `LOCAL_DB_USER`, `LOCAL_DB_PASSWORD`, and `LOCAL_DB_PORT`. |
| No events in Luna History | Luna server unreachable or network route down. | Check connection: `docker compose ... logs luna-ws` and verify `LUNA_HOST` in `.env`. |
| Port already in use (`3000` or `5370`) | A local Node process or another Docker container is using the port. | Change `APP_PORT=3002` in `.env` or stop conflicting services. |
