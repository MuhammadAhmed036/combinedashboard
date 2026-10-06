#!/bin/sh
# Align the local Postgres role password with .env without deleting data.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

read_env() {
  key="$1"
  value=$(grep -E "^${key}=" .env | tail -1 | cut -d= -f2- | tr -d '\r')
  if [ -z "$value" ]; then
    echo "Missing ${key} in .env" >&2
    exit 1
  fi
  printf '%s' "$value"
}

DB_USER=$(read_env LOCAL_DB_USER)
DB_PASSWORD=$(read_env LOCAL_DB_PASSWORD)
DB_NAME=$(read_env LOCAL_DB_NAME)

case "$DB_USER" in
  ''|*[!A-Za-z0-9_]*|[0-9]*) echo "LOCAL_DB_USER must be a simple PostgreSQL role name" >&2; exit 1 ;;
esac
case "$DB_NAME" in
  ''|*[!A-Za-z0-9_]*|[0-9]*) echo "LOCAL_DB_NAME must be a simple PostgreSQL database name" >&2; exit 1 ;;
esac

DOCKER=""
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  DOCKER="docker"
elif command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
else
  echo "Docker is required" >&2
  exit 1
fi

# SQL string escaping keeps passwords containing apostrophes safe.
ESCAPED_PASSWORD=$(printf '%s' "$DB_PASSWORD" | sed "s/'/''/g")
SQL="ALTER ROLE \"$DB_USER\" WITH LOGIN PASSWORD '$ESCAPED_PASSWORD';"

printf '%s\n' "$SQL" | $DOCKER exec -i -u postgres safecity-db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres >/dev/null

# Fail early with the same credentials used by the application.
$DOCKER exec -i safecity-db sh -c 'PGPASSWORD="$1" psql -h 127.0.0.1 -U "$2" -d "$3" -tAc "SELECT 1"' sh "$DB_PASSWORD" "$DB_USER" "$DB_NAME" >/dev/null

echo "Database credentials are ready."
