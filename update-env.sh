#!/bin/sh
# Run this after editing .env to apply the change. Plain `docker compose
# restart` (or even `up -d`) does NOT reload env_file for an already-running
# container — this uses --force-recreate, which does. The named data volume
# is untouched, so map regions survive.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

DOCKER=""
COMPOSE=""

find_docker() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    DOCKER="docker"
  elif command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
  else
    return 1
  fi
}

find_compose() {
  if $DOCKER compose version >/dev/null 2>&1; then
    COMPOSE="$DOCKER compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    return 1
  fi
}

if ! find_docker || ! find_compose; then
  if [ -x ./install-docker-offline.sh ]; then
    echo "Docker or Compose is missing. Running bundled offline installer."
    ./install-docker-offline.sh
  fi
fi
if ! find_docker || ! find_compose; then
  echo "Docker and Docker Compose are required." >&2
  exit 1
fi

echo "==> Validating .env"
if grep -Eq '<[A-Z_]+>|change_me' .env; then
  echo ".env still has placeholder values:" >&2
  grep -E '<[A-Z_]+>|change_me' .env >&2
  exit 1
fi

CONFIGURED_PORT=$(grep -E '^APP_PORT=' .env | tail -1 | cut -d= -f2-)
CONFIGURED_PORT="${CONFIGURED_PORT:-3000}"

# The port is already bound by the running container, so a straightforward
# check-port.sh call would report it as "in use" against itself. Stop first,
# then check, matching what --force-recreate is about to do anyway.
echo "==> Stopping current container"
$COMPOSE stop app >/dev/null 2>&1 || true

if ! ./check-port.sh "$CONFIGURED_PORT"; then
  echo "Port $CONFIGURED_PORT is in use by something else. Edit APP_PORT in .env and re-run." >&2
  exit 1
fi

echo "==> Applying updated .env"
$COMPOSE up -d --force-recreate

echo "==> Aligning database credentials and schema"
./repair-db-password.sh
./repair-schema.sh
$COMPOSE restart app person-count-ws sync >/dev/null

echo "==> Waiting for the container to become healthy"
i=0
while [ $i -lt 60 ]; do
  STATUS=$($DOCKER inspect --format '{{.State.Health.Status}}' safecity-dashboard 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    break
  fi
  if [ "$STATUS" = "unhealthy" ]; then
    echo "Container reported unhealthy. Recent logs:" >&2
    $COMPOSE logs --tail=50 >&2
    exit 1
  fi
  sleep 1
  i=$((i + 1))
done

VM_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="src") print $(i+1)}')
VM_IP="${VM_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
VM_IP="${VM_IP:-localhost}"

echo ""
echo "Updated. Dashboard: http://${VM_IP}:${CONFIGURED_PORT}"
