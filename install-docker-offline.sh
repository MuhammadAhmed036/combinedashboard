#!/bin/sh
# Installs Docker Engine + Docker Compose from files bundled with this
# offline release. This avoids apt/curl/network access on the target VM.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if [ "$(uname -s)" != "Linux" ]; then
  echo "This offline installer only supports Linux." >&2
  exit 1
fi

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ;;
  *)
    echo "This bundle includes Linux x86_64 Docker binaries, but this VM is $ARCH." >&2
    echo "Build a bundle with matching Docker assets for this architecture." >&2
    exit 1
    ;;
esac

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  echo "Root privileges are required, and sudo is not installed." >&2
  echo "Run this script as root." >&2
  exit 1
fi

if [ ! -d vendor/docker ]; then
  echo "Missing vendor/docker directory with offline Docker install files." >&2
  exit 1
fi

DOCKER_TGZ=$(find vendor/docker -maxdepth 1 -name 'docker-*.tgz' | sort | tail -1)
COMPOSE_BIN="vendor/docker/docker-compose-linux-x86_64"

if [ ! -f "$DOCKER_TGZ" ]; then
  echo "Missing Docker Engine archive under vendor/docker/docker-*.tgz" >&2
  exit 1
fi
if [ ! -f "$COMPOSE_BIN" ]; then
  echo "Missing Docker Compose binary at $COMPOSE_BIN" >&2
  exit 1
fi

echo "==> Installing Docker Engine from $DOCKER_TGZ"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
tar -xzf "$DOCKER_TGZ" -C "$TMP_DIR"
$SUDO install -m 0755 "$TMP_DIR"/docker/* /usr/local/bin/

echo "==> Installing Docker Compose"
$SUDO mkdir -p /usr/local/lib/docker/cli-plugins
$SUDO install -m 0755 "$COMPOSE_BIN" /usr/local/lib/docker/cli-plugins/docker-compose
$SUDO ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose

if ! getent group docker >/dev/null 2>&1; then
  echo "==> Creating docker group"
  $SUDO groupadd docker
fi

if [ -n "${USER:-}" ] && [ "$USER" != "root" ]; then
  echo "==> Adding $USER to docker group"
  $SUDO usermod -aG docker "$USER" || true
fi

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  echo "==> Creating systemd docker.service"
  SERVICE_FILE="$TMP_DIR/docker.service"
  cat > "$SERVICE_FILE" <<'EOF'
[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
After=network-online.target firewalld.service containerd.service
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/local/bin/dockerd --host=unix:///var/run/docker.sock
ExecReload=/bin/kill -s HUP $MAINPID
TimeoutStartSec=0
RestartSec=2
Restart=always
StartLimitBurst=3
StartLimitIntervalSec=60
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
TasksMax=infinity
Delegate=yes
KillMode=process
OOMScoreAdjust=-500

[Install]
WantedBy=multi-user.target
EOF
  $SUDO install -m 0644 "$SERVICE_FILE" /etc/systemd/system/docker.service
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now docker
else
  echo "==> systemd not detected; starting dockerd in the background"
  if ! pgrep -x dockerd >/dev/null 2>&1; then
    $SUDO sh -c 'nohup /usr/local/bin/dockerd --host=unix:///var/run/docker.sock >/var/log/dockerd.log 2>&1 &'
  fi
fi

echo "==> Waiting for Docker daemon"
i=0
while [ "$i" -lt 60 ]; do
  if docker info >/dev/null 2>&1 || $SUDO docker info >/dev/null 2>&1; then
    echo "Docker is ready."
    echo "If 'docker' requires sudo in this shell, log out/in later so docker-group membership refreshes."
    exit 0
  fi
  sleep 1
  i=$((i + 1))
done

echo "Docker did not become ready in time. Check logs with:" >&2
echo "  sudo journalctl -u docker --no-pager -n 100" >&2
echo "or:" >&2
echo "  sudo tail -100 /var/log/dockerd.log" >&2
exit 1
