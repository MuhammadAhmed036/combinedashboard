#!/usr/bin/env bash

# SafeCity Dashboard Status Check Script
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
PROJECT="$(grep -E '^PROJECT_NAME=' .env 2>/dev/null | tail -1 | cut -d= -f2-)"; PROJECT="${PROJECT:-combined}"
# Clean environment: shell variables would otherwise override .env for compose.
dc() { env -i PATH="$PATH" HOME="$HOME" ${DOCKER_HOST:+DOCKER_HOST="$DOCKER_HOST"} docker compose -p "$PROJECT" --env-file .env "$@"; }

if [ -f ".env" ]; then
    export $(grep -v '^#' .env | grep -v '^$' | tr -d '\r' | xargs -d '\n') 2>/dev/null || true
fi

TARGET_PORT="${APP_PORT:?APP_PORT must be set in .env}"

echo -e "${CYAN}${BOLD}=== SafeCity Dashboard Status ===${NC}"

# Check Docker status
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo -e "\n${BOLD}[Docker Containers]${NC}"
    dc ps 2>/dev/null || true
fi

# Check HTTP endpoint
echo -e "\n${BOLD}[Web Application Health]${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${TARGET_PORT}/api/runtime-config" || true)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "Port ${TARGET_PORT}: ${GREEN}[HEALTHY (HTTP 200)]${NC}"
else
    echo -e "Port ${TARGET_PORT}: ${RED}[DOWN or UNREACHABLE (HTTP ${HTTP_CODE})]${NC}"
fi

# Check Native Processes
if [ -d "logs" ]; then
    echo -e "\n${BOLD}[Native Background Services]${NC}"
    for pidfile in logs/*.pid; do
        if [ -f "$pidfile" ]; then
            NAME=$(basename "$pidfile" .pid)
            PID=$(cat "$pidfile" 2>/dev/null || true)
            if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
                echo -e "  - ${NAME} (PID ${PID}): ${GREEN}[RUNNING]${NC}"
            else
                echo -e "  - ${NAME} (PID ${PID}): ${RED}[STOPPED]${NC}"
            fi
        fi
    done
fi
echo ""

