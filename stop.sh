#!/usr/bin/env bash

# SafeCity Dashboard Stop Script
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Stopping SafeCity Dashboard services..."

# If docker is running
if command -v docker >/dev/null 2>&1; then
    docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
fi

# Stop native PID processes if any
if [ -d "logs" ]; then
    for pidfile in logs/*.pid; do
        if [ -f "$pidfile" ]; then
            PID=$(cat "$pidfile" 2>/dev/null || true)
            if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
                echo "Terminating process $PID ($pidfile)..."
                kill "$PID" 2>/dev/null || true
            fi
            rm -f "$pidfile"
        fi
    done
fi

echo -e "${GREEN}[OK] All services stopped successfully.${NC}"

