#!/usr/bin/env bash
# Preflight before `docker compose up`: every host port this dashboard publishes
# comes from .env, and other dashboards / the pipeline run on the same VM.
# Checks that each port key is set, valid, distinct, and either free or already
# held by THIS compose project's own container. On a conflict it names the
# listener and suggests a free port; it never edits .env.
# Usage: scripts/check-ports.sh            (exit 0 = safe to start)
set -u
cd "$(dirname "$0")/.."
KEYS="APP_PORT LOCAL_DB_PORT PERSON_COUNT_WS_PORT LUNA_WS_PORT"
PROJECT=$(sed -n 's/^name:[[:space:]]*//p' docker-compose.yml | head -1)

env_value() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '\r'; }

# Host ports published by this project's own running containers.
OWN_PORTS=""
if command -v docker >/dev/null 2>&1 && [ -n "$PROJECT" ]; then
  OWN_PORTS=$(docker ps --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Ports}}' \
    | tr ',' '\n' | sed -n 's/.*:\([0-9][0-9]*\)->.*/\1/p' | sort -u | tr '\n' ' ')
fi

status=0
seen=" "
for key in $KEYS; do
  port=$(env_value "$key")
  if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    echo "FAIL  $key='${port}' is missing or not a port number"; status=1; continue
  fi
  case "$seen" in *" $port "*) echo "FAIL  $key=$port is also used by another key in .env"; status=1; continue;; esac
  seen="$seen$port "
  if sh ./check-port.sh "$port"; then
    echo "OK    $key=$port is free"
  elif case " $OWN_PORTS " in *" $port "*) true;; *) false;; esac; then
    echo "OK    $key=$port is held by this project ($PROJECT)"
  else
    owner=$(ss -Hltnp "sport = :$port" 2>/dev/null | awk '{print $4, $6}' | head -1)
    next=$((port + 1))
    while :; do
      next=$(sh ./check-port.sh --find "$next") || break
      case "$seen $(for k in $KEYS; do env_value "$k"; done | tr '\n' ' ') " in *" $next "*) next=$((next + 1));; *) break;; esac
    done
    echo "FAIL  $key=$port is already in use by another service (${owner:-unknown listener}); a free port is $next — set $key=$next in .env"
    status=1
  fi
done
[ "$status" = 0 ] && echo "All host ports are free or owned by '$PROJECT'." || echo "Fix the ports above in .env before 'docker compose up'."
exit "$status"
