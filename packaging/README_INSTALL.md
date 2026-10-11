# combinedashboard — offline install

> **This bundle contains real credentials** (`defaults.env`: pipeline tokens, LUNA and team-DB passwords).
> Keep it inside the team. Do not upload, e-mail outside the team, or attach it to tickets.

No internet is needed on the target VM and nothing is built there. Requirements: Linux x86_64, Docker Engine with
the Compose v2 plugin (`docker compose`). This bundle does **not** include Docker binaries (`install-docker-offline.sh`
needs a `vendor/docker/` directory that is not shipped).

## Install

```bash
tar -xzf combinedashboard_<version>_<commit>_offline_UNTESTED.tar.gz
cd combinedashboard_<version>_<commit>_offline_UNTESTED
./install.sh                     # installs into ~/combinedashboard (change with --dir)
```

`install.sh` asks for every setting in `.env.example` order, showing the default in brackets:

```
  DETECTION_API_BASE_URL [http://192.168.18.213:18088]:
  DETECTION_API_TOKEN [****Xb7Q]:            (typed hidden; Enter keeps the default)
```

Enter keeps the value in brackets; type `-` to clear a value (required keys cannot be cleared).

Defaults: `--env-file` > existing `<dir>/.env` (upgrade) > `defaults.env` in this bundle (fresh install) >
`.env.example`. Placeholders (`<...>`, `change_me`) are never accepted for required keys.

- **Generated, never prompted:** `LOCAL_DB_PASSWORD` (new random value on every fresh install, kept on upgrade —
  PostgreSQL keeps the password its volume was created with), `DATABASE_URL`, image tags, `POSTGRES_IMAGE`.
- **Ports** (`APP_PORT`, `PERSON_COUNT_WS_PORT`, `LOCAL_DB_PORT`, `LUNA_WS_PORT`): each must be free (or already
  used by this installation); a busy port is rejected and the next free one is suggested.
- **`PROJECT_NAME`** (default `combined`): compose project and container prefix (`<name>-db`, `-dashboard`,
  `-sync`, `-person-count-ws`, `-luna-ws`). The installer refuses a name used by another compose project.
- A summary (secrets masked) is shown before anything is written. `.env` is written with mode 600.
- **Connectivity checks** (tokens used, never shown): Detection API `/api/health` + an authenticated call, Streams
  API (token, stream list), WHEP (token), Team DB (read-only `SELECT 1`), LUNA (warning only). A 401/403 from the
  pipeline means the token is refused — tokens may be IP-bound; issue new ones for this VM's IP and re-enter them
  (the installer offers this). Other pipeline failures ask "Continue anyway?" (default no).
- Start: `docker compose up -d --no-build --pull never` for this project only; waits for DB, dashboard HTTP 200,
  sync, person-count WebSocket and the LUNA relay. All services use `restart: unless-stopped`; the installer checks
  that `docker.service` is enabled at boot and asks before running `sudo systemctl enable docker`.

Unattended: `./install.sh --yes [--env-file my.env] [--dir /path] [--ignore-check-failures]`.

### Build-time settings

None. The images were built with every `NEXT_PUBLIC_*` empty; the server reads `NEXT_PUBLIC_LUNA_*` at runtime and
passes them to the browser through `/api/runtime-config`. `NEXT_PUBLIC_LUNA_WS_URL` is empty in `defaults.env`, so
every browser uses `ws://<page host>:LUNA_WS_PORT` (`localhost` only works in a browser on the VM itself).

## Upgrade

Extract the new bundle and run `./install.sh --dir <existing install dir>`. The existing `.env` is kept (backed up
as `.env.bak-<timestamp>`, offered for editing), data volumes are kept, image tags are switched to the new bundle,
and changed containers are recreated.

## Operate

```bash
cd ~/combinedashboard
./status.sh                         # containers + dashboard HTTP
./stop.sh                           # docker compose down (keeps data)
docker compose up -d --no-build --pull never
scripts/check-ports.sh              # port preflight
scripts/verify-pipeline.sh          # end-to-end checks against the running stack
docker compose logs -f sync
```

## Rollback

Run the previous bundle's `./install.sh --dir <install dir>` (keeps `.env` and data). To restore an older `.env`,
copy the matching `.env.bak-<timestamp>` back to `.env` first. `docker compose down -v` deletes this dashboard's
database volume — only on purpose.
