#!/bin/sh
# Usage:
#   check-port.sh <port>          exit 0 if free, 1 if a listener already owns it
#   check-port.sh --find <start>  print the first free port >= <start>
#
# Deliberately uses only tools present on a stock Ubuntu install (ss, or a
# /proc/net/tcp fallback) — never netstat/lsof/nc, which may not be
# installed on a minimal VM with no internet to fetch them.
set -eu

is_port_free() {
  port="$1"

  if command -v ss >/dev/null 2>&1; then
    if ss -Hltn "sport = :${port}" 2>/dev/null | grep -q .; then
      return 1
    fi
    return 0
  fi

  # Fallback: parse /proc/net/tcp[6] directly. State 0A = LISTEN. Ports are
  # hex; avoid awk's strtonum (Ubuntu's default awk is mawk, which lacks it)
  # and decode with printf instead.
  hex_port=$(printf '%04X' "$port")
  for f in /proc/net/tcp /proc/net/tcp6; do
    [ -r "$f" ] || continue
    if awk -v p=":$hex_port" 'NR>1 && $2 ~ p"$" && $4=="0A" {found=1} END{exit !found}' "$f"; then
      return 1
    fi
  done
  return 0
}

find_free_port() {
  start="$1"
  port="$start"
  while [ "$port" -lt 65535 ]; do
    if is_port_free "$port"; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
  done
  echo "No free port found starting at $start" >&2
  return 1
}

case "${1:-}" in
  --find)
    [ -n "${2:-}" ] || { echo "Usage: check-port.sh --find <start-port>" >&2; exit 2; }
    find_free_port "$2"
    ;;
  "" )
    echo "Usage: check-port.sh <port> | check-port.sh --find <start-port>" >&2
    exit 2
    ;;
  *)
    if is_port_free "$1"; then
      exit 0
    else
      exit 1
    fi
    ;;
esac
