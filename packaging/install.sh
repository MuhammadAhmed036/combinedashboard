#!/usr/bin/env bash
# combinedashboard offline installer / upgrader.
#
#   ./install.sh                              interactive install or upgrade
#   ./install.sh --yes                        accept every default, no prompts
#   ./install.sh --env-file my.env [--yes]    take values from a file first
#   options: --dir <install dir> (default: $HOME/combinedashboard)
#            --ignore-check-failures   continue when a pipeline connectivity check fails
#            --skip-checks             do not run connectivity checks
#
# Defaults for every key: --env-file > existing <dir>/.env (upgrade) >
# defaults.env baked into this bundle (fresh install) > .env.example.
# LOCAL_DB_PASSWORD is generated on a fresh install and kept on upgrade.
# Secrets are read hidden and never printed or logged. Only this dashboard's own
# compose project is touched; volumes are never removed.
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOME}/combinedashboard"
ENV_FILE_ARG=""
ASSUME_YES=0
IGNORE_CHECK_FAILURES=0
SKIP_CHECKS=0

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) INSTALL_DIR="${2:?--dir needs a path}"; shift 2 ;;
    --env-file) ENV_FILE_ARG="${2:?--env-file needs a file}"; shift 2 ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --ignore-check-failures) IGNORE_CHECK_FAILURES=1; shift ;;
    --skip-checks) SKIP_CHECKS=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

INSTALL_DIR="$(realpath -m "$INSTALL_DIR")"

if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'; else B=""; G=""; Y=""; R=""; N=""; fi
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s==> %s%s\n' "$B" "$*" "$N"; }
pass() { printf '  %sPASS%s  %s\n' "$G" "$N" "$*"; }
warn() { printf '  %sWARN%s  %s\n' "$Y" "$N" "$*"; }
fail() { printf '  %sFAIL%s  %s\n' "$R" "$N" "$*"; }
die()  { printf '%sERROR:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

INTERACTIVE=1
if [ "$ASSUME_YES" = 1 ]; then INTERACTIVE=0; elif [ ! -t 0 ]; then die "no terminal for prompts; use --yes (and --env-file) for unattended installs"; fi

confirm() { # confirm "question" default(y|n)
  local q="$1" def="$2" ans
  if [ "$INTERACTIVE" = 0 ]; then [ "$def" = y ]; return; fi
  read -r -p "$q [$( [ "$def" = y ] && echo Y/n || echo y/N )]: " ans || true
  ans="${ans:-$def}"; [[ "$ans" =~ ^[Yy] ]]
}

# ── bundle metadata ──────────────────────────────────────────────────────────
[ -f "$BUNDLE_DIR/VERSION" ] || die "VERSION missing — run install.sh from the extracted bundle"
# shellcheck disable=SC1091
. "$BUNDLE_DIR/VERSION"   # BUNDLE_VERSION GIT_COMMIT IMAGE_TAG POSTGRES_IMAGE IMAGES_ARCHIVE APP_IMAGE ...
for f in docker-compose.yml .env.example "$IMAGES_ARCHIVE"; do [ -e "$BUNDLE_DIR/$f" ] || die "bundle file missing: $f"; done

say "${B}combinedashboard ${BUNDLE_VERSION} (commit ${GIT_COMMIT})${N}"
say "Install directory: $INSTALL_DIR"

# ── docker ───────────────────────────────────────────────────────────────────
step "Docker"
if ! command -v docker >/dev/null 2>&1; then
  say "Docker is not installed."
  if [ -d "$BUNDLE_DIR/vendor/docker" ] && confirm "Install Docker from this bundle (needs sudo)?" n; then
    sh "$BUNDLE_DIR/install-docker-offline.sh"
  else
    die "install Docker Engine + Compose v2 first (install-docker-offline.sh needs vendor/docker, which this bundle does not include)"
  fi
fi
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then DOCKER="sudo docker"; else die "cannot talk to the Docker daemon (is it running? is $USER in the docker group?)"; fi
fi
$DOCKER compose version >/dev/null 2>&1 || die "Docker Compose v2 plugin (docker compose) is required"
pass "$($DOCKER version --format 'Docker {{.Server.Version}}') / $($DOCKER compose version --short 2>/dev/null || echo compose)"
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  if [ "$(systemctl is-enabled docker 2>/dev/null || true)" = enabled ]; then
    pass "docker.service is enabled at boot (containers restart: unless-stopped)"
  else
    warn "docker.service is NOT enabled at boot — the dashboard will not come back after a reboot"
    if [ "$INTERACTIVE" = 1 ] && confirm "Run 'sudo systemctl enable docker' now?" n; then
      sudo systemctl enable docker && pass "docker.service enabled"
    else
      say "        Run later: sudo systemctl enable docker"
    fi
  fi
fi

# ── layers of defaults ───────────────────────────────────────────────────────
declare -A EXAMPLE EXISTING DEFAULTS OVERRIDE FINAL
KEY_ORDER=()

load_env() { # load_env file assoc-name
  local file="$1" line key
  local -n target="$2"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"; target["$key"]="${BASH_REMATCH[2]}"
  done < "$file"
}

load_env "$BUNDLE_DIR/.env.example" EXAMPLE
while IFS= read -r line; do [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]] && KEY_ORDER+=("${BASH_REMATCH[1]}"); done < "$BUNDLE_DIR/.env.example"

UPGRADE=0
if [ -f "$INSTALL_DIR/.env" ]; then UPGRADE=1; load_env "$INSTALL_DIR/.env" EXISTING; fi
[ -f "$BUNDLE_DIR/defaults.env" ] && load_env "$BUNDLE_DIR/defaults.env" DEFAULTS
if [ -n "$ENV_FILE_ARG" ]; then [ -f "$ENV_FILE_ARG" ] || die "--env-file not found: $ENV_FILE_ARG"; load_env "$ENV_FILE_ARG" OVERRIDE; fi

# Keys present in any layer but not in .env.example are kept (appended at the end).
EXTRA_KEYS=()
for layer in OVERRIDE EXISTING DEFAULTS; do
  declare -n L="$layer"
  for k in "${!L[@]}"; do
    [[ -v EXAMPLE["$k"] ]] && continue
    [[ " ${EXTRA_KEYS[*]} " == *" $k "* ]] || EXTRA_KEYS+=("$k")
  done
  unset -n L
done

if [ "$UPGRADE" = 1 ]; then say "Mode: ${B}UPGRADE${N} (existing $INSTALL_DIR/.env and data volumes are kept)"; else say "Mode: ${B}FRESH INSTALL${N}"; fi

default_for() { # precedence: --env-file > existing .env > defaults.env > .env.example
  local k="$1"
  if [[ -v OVERRIDE["$k"] ]]; then printf '%s' "${OVERRIDE[$k]}"
  elif [[ -v EXISTING["$k"] ]]; then printf '%s' "${EXISTING[$k]}"
  elif [[ -v DEFAULTS["$k"] ]]; then printf '%s' "${DEFAULTS[$k]}"
  else printf '%s' "${EXAMPLE[$k]:-}"; fi
}

# Keys the stack cannot start without (frontend/scripts/check-env.mjs + compose port/LUNA wiring).
REQUIRED=" APP_PORT PROJECT_NAME DETECTION_API_BASE_URL DETECTION_API_TOKEN STREAMS_API_URL STREAMS_API_TOKEN CAMERA_FEED_BASE_URL CAMERA_FEED_TOKEN CAMERA_FEED_USERNAME CAMERA_FEED_PASSWORD LOCAL_DB_USER LOCAL_DB_NAME LOCAL_DB_PORT TEAM_DATABASE_URL PERSON_COUNT_WS_PORT LUNA_HOST LUNA_API_PORT LUNA_WS_PORT "
PORT_KEYS=" APP_PORT LOCAL_DB_PORT PERSON_COUNT_WS_PORT LUNA_WS_PORT "
# Set by the installer, never prompted.
AUTO_KEYS=" APP_IMAGE_TAG WS_IMAGE_TAG SYNC_IMAGE_TAG LUNA_WS_IMAGE_TAG POSTGRES_IMAGE LOCAL_DB_PASSWORD DATABASE_URL "

is_secret() { [[ "$1" =~ (TOKEN|PASSWORD|_PASS$|SECRET|ENCRYPTION_KEY) ]] || [ "$1" = TEAM_DATABASE_URL ]; }
is_placeholder() { [[ "$1" =~ \<[A-Za-z_]+\> ]] || [ "$1" = change_me ]; }
mask() { # mask key value
  local k="$1" v="$2"
  [ -z "$v" ] && { printf ''; return; }
  if [[ "$v" =~ ^([a-z][a-z0-9+.-]*://[^:/@]+:)([^@]*)(@.*)$ ]]; then printf '%s****%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[3]}"; return; fi
  if is_secret "$k"; then
    if [ "${#v}" -gt 8 ]; then printf '****%s' "${v: -4}"; else printf '****'; fi
  else printf '%s' "$v"; fi
}
gen_secret() { if command -v openssl >/dev/null 2>&1; then openssl rand -hex 24; else head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; fi; }

port_owner_is_us() { # port is published by a container of our own project
  local p="$1" proj="$2"
  $DOCKER ps --filter "label=com.docker.compose.project=$proj" --format '{{.Ports}}' | tr ',' '\n' | grep -Eq ":$p->"
}
port_free() { sh "$BUNDLE_DIR/check-port.sh" "$1"; }
next_free_port() { # next free port > $1 not already chosen for another key
  local p=$(( $1 + 1 ))
  while :; do
    p="$(sh "$BUNDLE_DIR/check-port.sh" --find "$p")" || return 1
    local taken=0; for k in $PORT_KEYS; do [ "${FINAL[$k]:-}" = "$p" ] && taken=1; done
    [ "$taken" = 0 ] && { echo "$p"; return; }; p=$((p + 1))
  done
}

port_reason() { # port_reason key value -> prints reason when the port cannot be used
  local k="$1" v="$2"
  [[ "$PORT_KEYS" == *" $k "* ]] || return 0
  local proj="${FINAL[PROJECT_NAME]:-combined}" dup=0
  for pk in $PORT_KEYS; do [ "$pk" != "$k" ] && [ "${FINAL[$pk]:-}" = "$v" ] && dup=1; done
  if [ "$dup" = 1 ]; then echo "port $v is already chosen for another key"; return; fi
  if ! port_free "$v" && ! { [ "$UPGRADE" = 1 ] && port_owner_is_us "$v" "$proj"; }; then
    local nf; nf="$(next_free_port "$v" || true)"
    echo "port $v is in use by another service${nf:+ — next free port: $nf}"
  fi
}

validate() { # validate key value -> prints reason when invalid
  local k="$1" v="$2"
  if [[ "$REQUIRED" == *" $k "* ]] && { [ -z "$v" ] || is_placeholder "$v"; }; then echo "required"; return; fi
  if [[ "$PORT_KEYS" == *" $k "* ]] && ! [[ "$v" =~ ^[0-9]+$ && "$v" -ge 1 && "$v" -le 65535 ]]; then echo "must be a port number"; return; fi
  case "$k" in
    PROJECT_NAME) [[ "$v" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || echo "lower-case letters, digits, - and _ only" ;;
    DETECTION_API_BASE_URL|STREAMS_API_URL|CAMERA_FEED_BASE_URL) [[ "$v" =~ ^https?:// ]] || echo "must start with http:// or https://" ;;
    TEAM_DATABASE_URL) [[ "$v" =~ ^postgres(ql)?:// ]] || echo "must be a postgres:// URL" ;;
    PERSON_COUNT_WS_URL|NEXT_PUBLIC_LUNA_WS_URL) [ -z "$v" ] || [[ "$v" =~ ^wss?:// ]] || echo "must be empty or start with ws:// or wss://" ;;
  esac
}

prompt_key() { # prompt_key key -> sets FINAL[key]
  local k="$1" def val reason shown
  def="$(default_for "$k")"
  if is_placeholder "$def"; then def=""; fi
  while :; do
    if [ "$INTERACTIVE" = 0 ]; then
      val="$def"
    else
      shown="$(mask "$k" "$def")"
      if is_secret "$k"; then
        read -r -s -p "  $k [${shown:-empty}]: " val || true; echo
      else
        read -r -p "  $k [${shown:-empty}]: " val || true
      fi
      # Enter keeps the default; a single "-" clears the value.
      if [ "$val" = "-" ]; then val=""; elif [ -z "$val" ]; then val="$def"; fi
    fi
    reason="$(validate "$k" "$val")"
    if [ -z "$reason" ]; then
      reason="$(port_reason "$k" "$val")"
      if [[ "$reason" == *"next free port: "* ]]; then def="${reason##*next free port: }"; fi
    fi
    if [ -z "$reason" ]; then FINAL["$k"]="$val"; return; fi
    if [ "$INTERACTIVE" = 0 ]; then
      if [[ "$reason" == port*in\ use* ]] && [ -n "$def" ] && [ "$def" != "$val" ]; then
        warn "$k: $reason — using $def"; continue
      fi
      die "$k: $reason (set it in --env-file)"
    fi
    warn "$k: $reason"
  done
}

# ── collect values ───────────────────────────────────────────────────────────
step "Settings"
EDIT=1
if [ "$UPGRADE" = 1 ] && [ -z "$ENV_FILE_ARG" ]; then
  EDIT=0; confirm "Review/edit the existing settings?" n && EDIT=1
fi
[ "$INTERACTIVE" = 1 ] && [ "$EDIT" = 1 ] && say "Enter = keep the value in [brackets], '-' = clear it (empty). Secrets are hidden as you type."

# PROJECT_NAME first (ports owned by our own project are allowed on upgrade).
if [ "$UPGRADE" = 1 ] && [[ -v EXISTING[PROJECT_NAME] ]]; then
  FINAL[PROJECT_NAME]="${EXISTING[PROJECT_NAME]}"
elif [ "$UPGRADE" = 1 ]; then
  FINAL[PROJECT_NAME]="$(default_for PROJECT_NAME)"
else
  prompt_key PROJECT_NAME
fi
PROJECT="${FINAL[PROJECT_NAME]}"

# The project name must not belong to another installation or compose project.
OTHER_DIR="$($DOCKER ps -a --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Label "com.docker.compose.project.working_dir"}}' | sort -u | head -1)"
if [ -n "$OTHER_DIR" ] && [ "$OTHER_DIR" != "$INSTALL_DIR" ]; then
  die "compose project '$PROJECT' already runs from $OTHER_DIR — choose another PROJECT_NAME or --dir $OTHER_DIR"
fi
for svc in db dashboard sync person-count-ws luna-ws; do
  owner="$($DOCKER ps -a --filter "name=^/${PROJECT}-${svc}$" --format '{{.Label "com.docker.compose.project"}}')"
  if [ -n "$owner" ] && [ "$owner" != "$PROJECT" ]; then die "container ${PROJECT}-${svc} belongs to project '$owner' — choose another PROJECT_NAME"; fi
done

for k in "${KEY_ORDER[@]}"; do
  [ "$k" = PROJECT_NAME ] && continue
  [[ "$AUTO_KEYS" == *" $k "* ]] && continue
  if [ "$EDIT" = 1 ]; then prompt_key "$k"; else FINAL["$k"]="$(default_for "$k")"; fi
done
for k in "${EXTRA_KEYS[@]}"; do
  [[ "$AUTO_KEYS" == *" $k "* ]] && continue
  FINAL["$k"]="$(default_for "$k")"
done

# Ports must still be free (or ours) when settings were not re-entered; prompt only on a conflict.
if [ "$EDIT" = 0 ]; then
  for k in $PORT_KEYS; do
    v="${FINAL[$k]}"; unset 'FINAL[$k]'
    problem="$(validate "$k" "$v")"; [ -z "$problem" ] && problem="$(port_reason "$k" "$v")"
    if [ -z "$problem" ]; then FINAL["$k"]="$v"; else warn "$k: $problem"; OVERRIDE["$k"]="$v"; prompt_key "$k"; fi
  done
fi

# Installer-managed keys.
FINAL[APP_IMAGE_TAG]="$IMAGE_TAG"; FINAL[WS_IMAGE_TAG]="$IMAGE_TAG"; FINAL[SYNC_IMAGE_TAG]="$IMAGE_TAG"; FINAL[LUNA_WS_IMAGE_TAG]="$IMAGE_TAG"
FINAL[POSTGRES_IMAGE]="$POSTGRES_IMAGE"
if [ "$UPGRADE" = 1 ] && [ -n "${EXISTING[LOCAL_DB_PASSWORD]:-}" ]; then
  FINAL[LOCAL_DB_PASSWORD]="${EXISTING[LOCAL_DB_PASSWORD]}"   # Postgres keeps the password its volume was created with
  DBPW_NOTE="kept (upgrade)"
else
  FINAL[LOCAL_DB_PASSWORD]="$(gen_secret)"
  DBPW_NOTE="generated for this install"
fi
FINAL[DATABASE_URL]="postgres://${FINAL[LOCAL_DB_USER]}:${FINAL[LOCAL_DB_PASSWORD]}@127.0.0.1:${FINAL[LOCAL_DB_PORT]}/${FINAL[LOCAL_DB_NAME]}"

# ── summary ──────────────────────────────────────────────────────────────────
step "Summary (secrets masked)"
for k in "${KEY_ORDER[@]}" "${EXTRA_KEYS[@]}"; do v="$(mask "$k" "${FINAL[$k]:-}")"; printf '  %-28s %s\n' "$k" "${v:-(empty)}"; done
say "  LOCAL_DB_PASSWORD: $DBPW_NOTE"
cat <<EOF

  Note: NEXT_PUBLIC_LUNA_* values are NOT built into this image (option a). They
  reach the browser only through /api/runtime-config at runtime, so they can be
  changed here without a rebuild. Leave NEXT_PUBLIC_LUNA_WS_URL empty to let every
  browser use ws://<page host>:LUNA_WS_PORT (localhost only works on the VM itself).
EOF
confirm "Write $INSTALL_DIR/.env and install?" y || die "aborted, nothing written"

# ── write files ──────────────────────────────────────────────────────────────
step "Writing $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
umask 077
ENV_BACKUP=""
if [ -f "$INSTALL_DIR/.env" ]; then
  ENV_BACKUP="$INSTALL_DIR/.env.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p "$INSTALL_DIR/.env" "$ENV_BACKUP"
  pass "previous .env backed up (mode 600)"
fi
TMP_ENV="$(mktemp "$INSTALL_DIR/.env.new.XXXXXX")"
while IFS= read -r line || [ -n "$line" ]; do
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]]; then printf '%s=%s\n' "${BASH_REMATCH[1]}" "${FINAL[${BASH_REMATCH[1]}]:-}"; else printf '%s\n' "$line"; fi
done < "$BUNDLE_DIR/.env.example" > "$TMP_ENV"
if [ "${#EXTRA_KEYS[@]}" -gt 0 ]; then
  { printf '\n# Additional keys carried over from the previous configuration.\n'; for k in "${EXTRA_KEYS[@]}"; do printf '%s=%s\n' "$k" "${FINAL[$k]:-}"; done; } >> "$TMP_ENV"
fi
chmod 600 "$TMP_ENV"; mv "$TMP_ENV" "$INSTALL_DIR/.env"
umask 022
for f in docker-compose.yml .env.example VERSION README_INSTALL.md CHANGELOG.md check-port.sh status.sh stop.sh install.sh; do
  [ -e "$BUNDLE_DIR/$f" ] && cp "$BUNDLE_DIR/$f" "$INSTALL_DIR/$f"
done
mkdir -p "$INSTALL_DIR/database" "$INSTALL_DIR/scripts"
rm -rf "$INSTALL_DIR/database/init-db"; cp -r "$BUNDLE_DIR/database/init-db" "$INSTALL_DIR/database/init-db"
cp "$BUNDLE_DIR"/scripts/*.sh "$INSTALL_DIR/scripts/"
chmod +x "$INSTALL_DIR"/*.sh "$INSTALL_DIR"/scripts/*.sh
pass ".env written (mode $(stat -c %a "$INSTALL_DIR/.env")), compose + scripts copied"

# ── images ───────────────────────────────────────────────────────────────────
step "Loading images (offline)"
$DOCKER load -i "$BUNDLE_DIR/$IMAGES_ARCHIVE" | sed 's/^/  /'
for img in $IMAGES; do $DOCKER image inspect "$img" >/dev/null 2>&1 && pass "$img" || die "image missing after load: $img"; done

# ── connectivity checks ──────────────────────────────────────────────────────
APP_IMG="safecity-ai-dashboard:${IMAGE_TAG}"
run_node() { $DOCKER run --rm --network host --env-file "$INSTALL_DIR/.env" --entrypoint node "$APP_IMG" -e "$1" 2>/dev/null; }

CHECK_JS='
const t=(ms)=>AbortSignal.timeout(ms), e=process.env, out=[];
const bearer=(x)=>x?{Authorization:"Bearer "+x}:{};
const code=async(url,init={})=>{try{const r=await fetch(url,{...init,signal:t(6000)});const b=await r.text();return [r.status,b]}catch(err){return [0,String(err.cause?.code||err.name)]}};
(async()=>{
 const base=(e.DETECTION_API_BASE_URL||"").replace(/\/+$/,"");
 let [s]=await code(base+"/api/health"); out.push(["detection_health",s]);
 [s]=await code(base+"/api/cameras",{headers:bearer(e.DETECTION_API_TOKEN)}); out.push(["detection_auth",s]);
 let [ss,b]=await code(e.STREAMS_API_URL,{headers:{Accept:"application/json",...bearer(e.STREAMS_API_TOKEN)}});
 let streams=[];try{streams=JSON.parse(b).streams||[]}catch{}
 out.push(["streams",ss,streams.length]);
 const name=(streams.find(x=>x.online)||streams[0]||{}).name||"__install_check__";
 const sdp="v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nc=IN IP4 0.0.0.0\r\na=rtpmap:96 H264/90000\r\na=recvonly\r\n";
 [s]=await code((e.CAMERA_FEED_BASE_URL||"").replace(/\/+$/,"")+"/"+encodeURIComponent(name)+"/whep",{method:"POST",headers:{"Content-Type":"application/sdp",...bearer(e.CAMERA_FEED_TOKEN)},body:sdp}); out.push(["whep",s,name]);
 const lh=e.LUNA_AUTH_USER||e.LUNA_AUTH_PASS?{Authorization:"Basic "+Buffer.from((e.LUNA_AUTH_USER||"")+":"+(e.LUNA_AUTH_PASS||"")).toString("base64")}:{};
 if(e.LUNA_ACCOUNT_ID) lh["Luna-Account-Id"]=e.LUNA_ACCOUNT_ID;
 [s]=await code("http://"+e.LUNA_HOST+":"+e.LUNA_API_PORT+"/6/lists?page=1&page_size=1",{headers:lh}); out.push(["luna",s]);
 for(const r of out) console.log(r.join("|"));
})();'

run_checks() { # sets CHECK_FAILED / AUTH_FAILED_KEYS
  CHECK_FAILED=0; AUTH_FAILED_KEYS=""
  local lines; lines="$(run_node "$CHECK_JS" || true)"
  [ -n "$lines" ] || { fail "could not run checks (app image)"; CHECK_FAILED=1; return; }
  while IFS='|' read -r what st extra; do
    case "$what" in
      detection_health) [ "$st" = 200 ] && pass "Detection API reachable (/api/health 200)" || { fail "Detection API /api/health -> ${st/#0/unreachable}"; CHECK_FAILED=1; } ;;
      detection_auth)
        if [ "$st" = 200 ]; then pass "Detection API token accepted (/api/cameras 200)"
        elif [ "$st" = 401 ] || [ "$st" = 403 ]; then fail "Detection API refused DETECTION_API_TOKEN (HTTP $st)"; CHECK_FAILED=1; AUTH_FAILED_KEYS+=" DETECTION_API_TOKEN"
        else fail "Detection API /api/cameras -> ${st/#0/unreachable}"; CHECK_FAILED=1; fi ;;
      streams)
        if [ "$st" = 200 ]; then pass "Streams API token accepted ($extra streams)"
        elif [ "$st" = 401 ] || [ "$st" = 403 ]; then fail "Streams API refused STREAMS_API_TOKEN (HTTP $st)"; CHECK_FAILED=1; AUTH_FAILED_KEYS+=" STREAMS_API_TOKEN"
        else fail "Streams API -> ${st/#0/unreachable}"; CHECK_FAILED=1; fi ;;
      whep)
        case "$st" in
          201|400|404) pass "WHEP reachable, token accepted (probe '$extra' -> HTTP $st)" ;;
          401|403) fail "WHEP refused CAMERA_FEED_TOKEN (HTTP $st)"; CHECK_FAILED=1; AUTH_FAILED_KEYS+=" CAMERA_FEED_TOKEN" ;;
          *) fail "WHEP -> ${st/#0/unreachable}"; CHECK_FAILED=1 ;;
        esac ;;
      luna)
        case "$st" in
          200) pass "LUNA API reachable, credentials accepted" ;;
          401|403) warn "LUNA refused the credentials (HTTP $st) — the LUNA panel will be empty (install continues)" ;;
          *) warn "LUNA API -> ${st/#0/unreachable} — the LUNA panel stays empty until LUNA is reachable (install continues)" ;;
        esac ;;
    esac
  done <<< "$lines"
  # Team DB: read-only transaction, SELECT 1 only.
  if $DOCKER run --rm --network host --env-file "$INSTALL_DIR/.env" -e PGOPTIONS='-c default_transaction_read_only=on' -e PGCONNECT_TIMEOUT=6 \
       --entrypoint sh "${FINAL[POSTGRES_IMAGE]}" -c 'psql "$TEAM_DATABASE_URL" -tAc "SELECT 1"' 2>/dev/null | grep -qx 1; then
    pass "Team DB reachable (read-only SELECT 1)"
  else
    fail "Team DB: cannot connect with TEAM_DATABASE_URL"; CHECK_FAILED=1
  fi
}

rewrite_env_key() { # rewrite_env_key key value
  local k="$1" v="$2" tmp; tmp="$(mktemp "$INSTALL_DIR/.env.new.XXXXXX")"
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" == "$k="* ]]; then printf '%s=%s\n' "$k" "$v"; else printf '%s\n' "$line"; fi
  done < "$INSTALL_DIR/.env" > "$tmp"; chmod 600 "$tmp"; mv "$tmp" "$INSTALL_DIR/.env"
}

if [ "$SKIP_CHECKS" = 0 ]; then
  while :; do
    step "Connectivity checks (tokens are used, never shown)"
    run_checks
    [ "$CHECK_FAILED" = 0 ] && break
    if [ -n "$AUTH_FAILED_KEYS" ]; then
      say ""
      say "  ${Y}Tokens may be IP-bound: issue new tokens for this VM's IP on the pipeline side and re-enter them.${N}"
      if [ "$INTERACTIVE" = 1 ] && confirm "Re-enter${AUTH_FAILED_KEYS} now?" y; then
        for k in $AUTH_FAILED_KEYS; do OVERRIDE["$k"]=""; unset 'EXISTING[$k]' 'DEFAULTS[$k]'; prompt_key "$k"; rewrite_env_key "$k" "${FINAL[$k]}"; done
        continue
      fi
    fi
    if [ "$IGNORE_CHECK_FAILURES" = 1 ]; then warn "continuing despite failed checks (--ignore-check-failures)"; break; fi
    if [ "$INTERACTIVE" = 1 ] && confirm "Pipeline checks failed. Continue anyway?" n; then break; fi
    if [ -n "$ENV_BACKUP" ]; then
      cp -p "$ENV_BACKUP" "$INSTALL_DIR/.env"
      say "  previous .env restored; the running installation was not changed"
    fi
    die "connectivity checks failed — fix the values (re-run ./install.sh) or use --ignore-check-failures"
  done
fi

# ── start ────────────────────────────────────────────────────────────────────
step "Starting project '$PROJECT' (other compose projects are not touched)"
cd "$INSTALL_DIR"
# Clean environment: compose lets shell variables override .env, so a caller
# with e.g. PROJECT_NAME or APP_PORT exported could redirect it to another project.
env -i PATH="$PATH" HOME="$HOME" ${DOCKER_HOST:+DOCKER_HOST="$DOCKER_HOST"} ${DOCKER_CONFIG:+DOCKER_CONFIG="$DOCKER_CONFIG"} \
  $DOCKER compose -p "$PROJECT" --project-directory "$INSTALL_DIR" -f "$INSTALL_DIR/docker-compose.yml" --env-file "$INSTALL_DIR/.env" \
  up -d --no-build --pull never --remove-orphans 2>&1 | sed 's/^/  /'

wait_for() { # wait_for description seconds command...
  local what="$1" secs="$2"; shift 2; local i=0
  while [ "$i" -lt "$secs" ]; do if "$@" >/dev/null 2>&1; then pass "$what"; return 0; fi; sleep 2; i=$((i + 2)); done
  fail "$what (not within ${secs}s)"; return 1
}
health_is() { [ "$($DOCKER inspect --format '{{.State.Health.Status}}' "$1" 2>/dev/null)" = "$2" ]; }
logs_have() { $DOCKER logs "$1" 2>&1 | grep -q "$2"; }

step "Waiting for health"
ok=1
wait_for "database ready ($PROJECT-db healthy)" 120 health_is "$PROJECT-db" healthy || ok=0
wait_for "dashboard HTTP 200 on port ${FINAL[APP_PORT]}" 180 health_is "$PROJECT-dashboard" healthy || ok=0
wait_for "sync running" 120 logs_have "$PROJECT-sync" "\[sync\] running" || ok=0
wait_for "person-count WebSocket listening on ${FINAL[PERSON_COUNT_WS_PORT]}" 60 logs_have "$PROJECT-person-count-ws" "listening on" || ok=0
wait_for "LUNA relay listening on ${FINAL[LUNA_WS_PORT]}" 60 logs_have "$PROJECT-luna-ws" "listening" || ok=0
{ $DOCKER logs "$PROJECT-sync" 2>&1 | grep -E "start cursor|resuming detection_events cursor|mirrored" || true; } | tail -3 | sed 's/^/        /'

say ""
say "Restart policy: $($DOCKER inspect --format '{{.Name}}={{.HostConfig.RestartPolicy.Name}}' "$PROJECT-db" "$PROJECT-dashboard" "$PROJECT-sync" "$PROJECT-person-count-ws" "$PROJECT-luna-ws" | tr '\n' ' ')"
if [ "$ok" = 1 ]; then
  say "${G}${B}Installed.${N} Open http://<this VM's IP>:${FINAL[APP_PORT]}/dashboard   (project '$PROJECT', dir $INSTALL_DIR)"
else
  say "${Y}Started with warnings above.${N} Check: cd $INSTALL_DIR && docker compose ps && docker compose logs --tail 50"
  exit 1
fi
