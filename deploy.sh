#!/usr/bin/env bash
set -eu

# ==============================================================================
# SafeCity AI Dashboard - Production Offline Deployment Script
# ==============================================================================

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "======================================================================"
echo "         SafeCity AI Dashboard - Offline Deployment Launcher          "
echo "======================================================================"
echo -e "${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ------------------------------------------------------------------------------
# 1. Check for .env file
# ------------------------------------------------------------------------------
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}[!] .env not found. Creating .env from .env.example...${NC}"
        cp .env.example .env
        echo -e "${RED}[!] Please edit .env with your network configuration first:${NC}"
        echo -e "    ${BOLD}nano .env${NC}"
        echo -e "    Then run ${BOLD}./deploy.sh${NC} again.\n"
        exit 1
    else
        echo -e "${RED}[ERROR] Neither .env nor .env.example found!${NC}"
        exit 1
    fi
fi

# Normalize line endings in .env if needed (removes Windows carriage returns)
sed -i 's/\r$//' .env 2>/dev/null || true

# Load .env safely
export $(grep -v '^#' .env | grep -v '^$' | tr -d '\r' | xargs -d '\n') 2>/dev/null || true

# ------------------------------------------------------------------------------
# 2. Check and Install Docker Offline if Missing
# ------------------------------------------------------------------------------
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

echo -e "${CYAN}[*] Checking Docker environment...${NC}"
DOCKER="docker"
COMPOSE="docker compose"

if ! find_docker || ! find_compose; then
    if [ -f "./install-docker-offline.sh" ] && [ -d "./vendor/docker" ]; then
        echo -e "${YELLOW}[!] Docker or Docker Compose is missing.${NC}"
        echo -e "${CYAN}[*] Installing bundled offline Docker Engine & Compose...${NC}"
        chmod +x ./install-docker-offline.sh
        ./install-docker-offline.sh
    fi
fi

if ! find_docker || ! find_compose; then
    echo -e "${RED}[ERROR] Docker and Docker Compose are required to run the container stack.${NC}"
    echo -e "        Please ensure Docker Engine is active: sudo systemctl start docker"
    exit 1
fi
echo -e "${GREEN}[OK] Docker Engine and Compose are active.${NC}\n"

# ------------------------------------------------------------------------------
# 3. Port Configuration & Availability Check
# ------------------------------------------------------------------------------
TARGET_PORT="${APP_PORT:-3000}"
WS_PORT="${PERSON_COUNT_WS_PORT:-8090}"
LUNA_PORT="${LUNA_WS_PORT:-8092}"
DB_PORT="${LOCAL_DB_PORT:-5470}"

echo -e "${CYAN}[*] Configured Ports from .env:${NC}"
echo -e "    - Web Dashboard (APP_PORT)     : ${BOLD}${TARGET_PORT}${NC}"
echo -e "    - Person Count WS (WS_PORT)    : ${BOLD}${WS_PORT}${NC}"
echo -e "    - Luna WS (LUNA_WS_PORT)       : ${BOLD}${LUNA_PORT}${NC}"
echo -e "    - Local Postgres (DB_PORT)     : ${BOLD}${DB_PORT}${NC}\n"

check_port() {
    local port=$1
    local name=$2
    if [ -x ./check-port.sh ]; then
        if ! ./check-port.sh "$port"; then
            echo -e "${RED}[ERROR] Port ${port} (${name}) is already in use by another process!${NC}"
            echo -e "        Please change ${name} in .env or stop the conflicting service."
            return 1
        fi
    elif command -v ss >/dev/null 2>&1; then
        if ss -tuln | grep -q ":${port} "; then
            echo -e "${RED}[ERROR] Port ${port} (${name}) is already in use by another process!${NC}"
            return 1
        fi
    fi
    return 0
}

echo -e "${CYAN}[*] Verifying port availability...${NC}"
check_port "$TARGET_PORT" "APP_PORT" || exit 1
check_port "$WS_PORT" "PERSON_COUNT_WS_PORT" || exit 1
check_port "$LUNA_PORT" "LUNA_WS_PORT" || exit 1
echo -e "${GREEN}[OK] All required ports are available.${NC}\n"

# ------------------------------------------------------------------------------
# 4. Load Pre-built Offline Docker Images
# ------------------------------------------------------------------------------
if [ -f "images.tar.gz" ]; then
    echo -e "${CYAN}[*] Loading pre-built runtime images from images.tar.gz (100% offline)...${NC}"
    $DOCKER load -i images.tar.gz
    echo -e "${GREEN}[OK] Images successfully loaded.${NC}\n"
else
    echo -e "${YELLOW}[!] Note: images.tar.gz not found, will build from local Dockerfile.${NC}\n"
fi

# Locate Compose file
COMPOSE_FILE="./docker-compose.yml"
if [ ! -s "$COMPOSE_FILE" ]; then
    if [ -s "./docker/docker-compose.yml" ]; then
        COMPOSE_FILE="./docker/docker-compose.yml"
    else
        echo -e "${RED}[ERROR] Neither ./docker-compose.yml nor ./docker/docker-compose.yml is found!${NC}"
        exit 1
    fi
fi
echo -e "${CYAN}[*] Using Compose file: ${BOLD}${COMPOSE_FILE}${NC}"

# Ensure init-db permissions
chmod -R 755 docker/init-db 2>/dev/null || true
chmod -R 755 database/init-db 2>/dev/null || true

# ------------------------------------------------------------------------------
# 5. Start Container Stack
# ------------------------------------------------------------------------------
echo -e "${CYAN}[*] Starting application containers with Docker Compose...${NC}"
$COMPOSE -f "$COMPOSE_FILE" down 2>/dev/null || true
$COMPOSE -f "$COMPOSE_FILE" up -d

# Align DB password and schema if helper scripts exist
if [ -x ./repair-db-password.sh ]; then
    ./repair-db-password.sh 2>/dev/null || true
fi
if [ -x ./repair-schema.sh ]; then
    ./repair-schema.sh 2>/dev/null || true
fi

# ------------------------------------------------------------------------------
# 6. Verify Healthcheck
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[*] Waiting for dashboard service to become healthy...${NC}"
ATTEMPTS=0
MAX_ATTEMPTS=45
SUCCESS=0

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    ATTEMPTS=$((ATTEMPTS + 1))
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${TARGET_PORT}/api/runtime-config" || true)
    if [ "$HTTP_CODE" = "200" ]; then
        SUCCESS=1
        break
    fi
    sleep 2
    echo -n "."
done
echo ""

if [ "$SUCCESS" -eq 1 ]; then
    echo -e "\n${GREEN}${BOLD}======================================================================"
    echo -e "       APPLICATION SUCCESSFULLY DEPLOYED AND RUNNING!                 "
    echo -e "======================================================================${NC}"
    VM_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="src") print $(i+1)}' || true)
    VM_IP="${VM_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
    VM_IP="${VM_IP:-localhost}"

    echo -e "Dashboard URL : ${CYAN}${BOLD}http://${VM_IP}:${TARGET_PORT}${NC}"
    echo -e "Local URL     : ${CYAN}${BOLD}http://localhost:${TARGET_PORT}${NC}"
    echo -e "Status Check  : ${BOLD}docker compose ps${NC}"
    echo -e "View Logs     : ${BOLD}docker compose logs -f app${NC}"
    echo -e "Stop App      : ${BOLD}./stop.sh${NC}"
    echo -e "${GREEN}======================================================================${NC}\n"
else
    echo -e "\n${YELLOW}[!] Application container started, but health endpoint did not return 200 yet.${NC}"
    echo -e "    Check container logs using: ${BOLD}$COMPOSE -f "$COMPOSE_FILE" logs --tail=50 app${NC}\n"
fi
