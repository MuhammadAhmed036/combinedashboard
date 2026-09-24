# Running SafeCity AI Dashboard on an Ubuntu VM

This is the complete guide for taking the packaged `.tar` file and getting
the dashboard running on an Ubuntu VM with **no internet access at all**.
The archive contains all application images, Compose files, deployment
scripts, a source snapshot, and offline Docker/Compose binaries. The VM
never runs `docker build` or downloads packages.

Hand this file, together with `safecity-dashboard-<version>.tar`, to
whoever has access to the VM.

---

## 0. What you need before you start

- A `safecity-dashboard-<version>.tar` file (produced by
  `packaging/package-release.sh` on a connected build machine).
- Shell access to the target Ubuntu VM (SSH, or a console session).
- Root/sudo access if Docker is not already installed.
- Linux x86_64/amd64. The bundled Docker binaries are architecture-specific.
- The real network addresses this deployment needs to reach: the detection
  API host/port, the camera stream API host/port, and their credentials.
  Without these the app will run but show no cameras — get them from
  whoever manages those services before you begin.

Check whether Docker is already present:
  ```sh
  docker --version && docker compose version
  ```

---

## 1. Installing Docker (only if it isn't already there)

If Docker or Compose is missing, the archive installs them locally from its
bundled static binaries. This step needs root/sudo but does not need internet:
```sh
./install-docker-offline.sh
```
`deploy.sh` runs this installer automatically when needed.

---

## 2. Copy and extract the bundle

Get `safecity-dashboard-<version>.tar` onto the VM by any means available
(USB drive, `scp`, internal file share) — this file has everything else
inside it, nothing else needs to be transferred.

```sh
mkdir -p ~/safecity-dashboard
tar -xf safecity-dashboard-*.tar -C ~/safecity-dashboard
cd ~/safecity-dashboard
ls
```
You should see: `images.tar.gz`, `docker-compose.yml`, `.env.example`,
`deploy.sh`, `update-env.sh`, `repair-schema.sh`, `check-port.sh`,
`install-docker-offline.sh`, `repair-db-password.sh`, `docker/init-db/`, `vendor/`, `source.tar.gz`,
`CHECKSUMS.sha256`, and `VERSION`.

The scripts are already executable inside the `.tar`, but some transfer
methods (certain SCP/SFTP clients, especially from Windows) can strip that
bit — if `./deploy.sh` says "Permission denied", just run:
```sh
chmod +x *.sh
```

(Optional but recommended) verify nothing was corrupted in transit:
```sh
sha256sum -c CHECKSUMS.sha256
```
Every line should say `OK`.

---

## 3. First-time deployment

```sh
./deploy.sh
```

The first run won't find a `.env` file yet, so it copies `.env.example` to
`.env` and stops with a reminder to fill it in. Open `.env`:

```sh
nano .env
```

Fill in the real values for this network — at minimum:

| Variable | What it is |
|---|---|
| `DETECTION_API_BASE_URL` | Address of the AI/detection backend (e.g. `http://10.0.1.20:18088`) |
| `STREAMS_API_URL` | Camera list API endpoint |
| `STREAMS_API_USERNAME` / `STREAMS_API_PASSWORD` | Credentials for the above |
| `CAMERA_FEED_BASE_URL` | Address of the live camera feed relay |
| `CAMERA_FEED_USERNAME` / `CAMERA_FEED_PASSWORD` | Credentials for the above |
| `LOCAL_DB_PASSWORD` | Any strong password for this VM's bundled Postgres |
| `TEAM_DATABASE_URL` | Read-only URL for the source detection database |
| `PERSON_COUNT_WS_URL` | Browser URL for this VM's WebSocket, normally `ws://<VM_IP>:8090` |

`APP_PORT` (default `3000`) is the port the dashboard will be reachable on
from a browser — change it now if you already know it should be different,
or just leave it and let the next step handle a conflict automatically.

No inline `#` comments after a value, and no quotes — the whole rest of the
line is taken literally.

Save the file, then run the same command again:
```sh
./deploy.sh
```

This time it will:
1. Check whether `APP_PORT` is already in use on this VM. If it is, it
   offers a free port interactively (or auto-picks one with `./deploy.sh --yes`)
   and updates `.env` to match.
2. Load all Docker images (`docker load`) — no network needed, they are
  already inside the bundle.
3. Start the stack (`docker compose up -d`): bundled Postgres, dashboard,
  person-count WebSocket, and sync service.
4. Apply the bundled idempotent database schema. Existing database data and
  named volumes are preserved.
5. Wait for the dashboard container to report healthy and print the access URL, e.g.:
   ```
   Deployed. Dashboard: http://192.168.1.50:3000
   ```

Open that URL from a browser on the same network to confirm the dashboard
loads and cameras appear.

### Local database and team database

This deployment has two separate databases:

- `db` / `safecity-db` is the SafeCity-owned local Postgres. The app,
  WebSocket, and sync service use it internally as `db:5432`. It is not
  published on the VM host, so it cannot conflict with the team's Postgres.
- `TEAM_DATABASE_URL` is the team's source database. Sync reads detection and
  camera data from it and mirrors the required records into the local DB.

Keep `TEAM_DATABASE_URL` read-only. Perform dashboard CRUD against the local
database through the dashboard APIs, not directly against the team database.
Camera locations and dashboard alert state belong to the local DB; mirrored
`detection_events` and team camera records are refreshed by sync.

The deployment automatically aligns the local `dashboard` role password with
`LOCAL_DB_PASSWORD` and applies idempotent schema migrations. Use
`./update-env.sh` after changing database credentials. Never run
`docker compose down -v`, because it deletes the local database volume.

If an older bundle was already deployed and shows `relation "camera_locations"
does not exist`, copy the new bundle to the VM and run `./deploy.sh` from its
extracted directory. For a manual repair without restarting the whole stack:

```sh
./repair-schema.sh
docker compose restart app person-count-ws sync
```

---

## 4. Changing configuration later

Whenever any address, credential, or port needs to change:

```sh
nano .env        # edit whatever needs to change
./update-env.sh
```

**Do not** use `docker restart` or `docker compose restart` for this —
Compose does not reload `.env` values into an already-running container, so
the edit would silently not take effect. `update-env.sh` recreates the
container the right way (`--force-recreate`), which does pick it up. No
rebuild, no re-copying the `.tar` — the same image is reused.

User-drawn map regions are stored in a separate Docker volume and are
completely unaffected by `.env` changes, container restarts, or even
`docker compose down` — only deleting the volume itself would remove them.

---

## 5. Network requirements

The VM does not need internet access after the bundle is transferred. It does
need network access to the configured detection backend, camera stream API,
camera feed relay, and team's source database. The browser machine must also
reach `DETECTION_API_BASE_URL`, `CAMERA_FEED_BASE_URL`, and
`PERSON_COUNT_WS_URL` directly. For a browser on the same VM, use
`ws://127.0.0.1:8090`; for another machine, use `ws://<VM_IP>:8090`.

---

## 6. Everyday commands

Run these from inside `~/safecity-dashboard`:

| Task | Command |
|---|---|
| Check status | `docker compose ps` |
| View logs | `docker compose logs --tail=100 -f` |
| View WebSocket logs | `docker compose logs --tail=100 -f person-count-ws` |
| View sync logs | `docker compose logs --tail=100 -f sync` |
| Restart WebSocket | `docker compose restart person-count-ws` |
| Stop the app | `docker compose down` |
| Start it again (no changes) | `docker compose up -d` |
| Apply an `.env` change | `./update-env.sh` |
| Back up map regions | `docker compose cp app:/app/data/map-regions.json ./map-regions-backup.json` |
| Restore map regions | `docker compose cp ./map-regions-backup.json app:/app/data/map-regions.json` |

---

## Troubleshooting

- **`docker info` fails / "Cannot connect to the Docker daemon"** — the
  daemon isn't running: `sudo systemctl start docker`. If it's a permissions
  error, your user isn't in the `docker` group yet: `sudo usermod -aG docker
  $USER && newgrp docker`.
- **Container shows unhealthy** — `docker compose logs --tail=100` from the
  bundle directory; most often a wrong/unreachable address in `.env`.
- **Dashboard loads but shows no cameras** — `DETECTION_API_BASE_URL` or
  `STREAMS_API_URL` is wrong, unreachable from the VM, or has the wrong
  credentials. The banner at the top of the dashboard names which one.
- **Port already in use** — `./deploy.sh` and `./update-env.sh` both detect
  this automatically and offer a free port; you never need to find one by
  hand.
- **Checksum mismatch on `sha256sum -c`** — the `.tar` was corrupted during
  transfer; re-copy it and try again rather than proceeding.
