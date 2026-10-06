#!/bin/sh
# Apply the bundled idempotent schema files to the running local Postgres.
# This is safe for an existing data volume: the SQL uses IF NOT EXISTS.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

DOCKER=""
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  DOCKER="docker"
elif command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
else
  echo "docker is required" >&2
  exit 1
fi

if [ ! -d ./docker/init-db ]; then
  echo "Missing docker/init-db schema files" >&2
  exit 1
fi

for schema in ./docker/init-db/*.sql; do
  echo "==> Applying $(basename "$schema")"
  $DOCKER exec -i safecity-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$schema"
done

echo "Database schema is ready."
