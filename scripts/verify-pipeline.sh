#!/usr/bin/env bash
# Read-only smoke test of the pipeline integration against the RUNNING stack
# (docker compose project "combined"). Talks only to this dashboard and its own
# containers; prints no secrets. Usage: scripts/verify-pipeline.sh [base_url]
set -u
cd "$(dirname "$0")/.."
PROJECT="$(grep -E '^PROJECT_NAME=' .env 2>/dev/null | tail -1 | cut -d= -f2-)"; PROJECT="${PROJECT:-combined}"
APP_PORT=$(grep -E '^APP_PORT=' .env | cut -d= -f2)
BASE="${1:-http://127.0.0.1:${APP_PORT}}"
PASS=0; FAIL=0
ok()   { echo "PASS  $*"; PASS=$((PASS+1)); }
bad()  { echo "FAIL  $*"; FAIL=$((FAIL+1)); }
local_sql() { docker exec "$PROJECT-db" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAX -c "$1"' sh "$1"; }
source_max() {
  docker exec "$PROJECT-sync" node -e '
    const { Pool } = require("pg");
    const p = new Pool({ connectionString: process.env.TEAM_DATABASE_URL });
    p.query("SELECT MAX(id) AS m FROM detection_events").then(r => { console.log(r.rows[0].m); return p.end(); });'
}

echo "== runtime config (browser) =="
RC=$(curl -s "$BASE/api/runtime-config")
if echo "$RC" | grep -qiE 'cameraFeed|token|"apiBase":"http'; then bad "runtime-config exposes feed/token/upstream: $RC"; else ok "runtime-config has no feed credentials, tokens or detection upstream"; fi

echo "== camera list (stream-status API) =="
HDRS=$(curl -s -D - -o /tmp/vp-cams.json "$BASE/api/stream-cameras")
N=$(node -e 'const c=require("/tmp/vp-cams.json"); console.log(Array.isArray(c)?c.length:-1)')
ONLINE=$(node -e 'const c=require("/tmp/vp-cams.json"); console.log(c.filter(x=>x.status==="online").map(x=>x.sourceName).join(","))')
if echo "$HDRS" | grep -qi 'x-camera-source: registry-fallback'; then bad "camera list fell back to the local registry (stream-status API failed)"; elif [ "$N" -gt 0 ]; then ok "camera list: $N cameras from stream-status (online: $ONLINE)"; else bad "camera list empty: $(cat /tmp/vp-cams.json)"; fi

echo "== live video WHEP proxy =="
CAM=$(node -e 'const c=require("/tmp/vp-cams.json"); const o=c.find(x=>x.status==="online"); console.log(o?o.sourceName:"")')
SDP=$'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nc=IN IP4 0.0.0.0\r\na=rtpmap:96 H264/90000\r\na=recvonly\r\na=setup:actpass\r\na=ice-ufrag:probe\r\na=ice-pwd:probeprobeprobeprobeprobe\r\n'
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/sdp' --data-binary "$SDP" "$BASE/api/camera-feed/$CAM/whep")
case "$CODE" in 201|400) ok "WHEP proxy reached the streaming server with the token for $CAM (HTTP $CODE; 400 = token accepted, probe SDP rejected)";; *) bad "WHEP proxy for $CAM returned HTTP $CODE";; esac
CODE=$(curl -s --path-as-is -o /dev/null -w '%{http_code}' -X POST --data-binary x "$BASE/api/camera-feed/..%2F..%2Fx/whep")
[ "$CODE" = 400 ] || [ "$CODE" = 404 ] && ok "WHEP proxy rejects a traversal camera name (HTTP $CODE)" || bad "WHEP traversal returned HTTP $CODE"

echo "== detection frames (detection API through /api/ai) =="
EID=$(local_sql "SELECT event_id FROM detection_events WHERE raw_image_status='available' ORDER BY id DESC LIMIT 1")
if [ -n "$EID" ]; then
  R=$(curl -s -o /dev/null -w '%{http_code} %{content_type} %{size_download}' "$BASE/api/ai/v2/events/$EID/image?kind=raw")
  case "$R" in "200 image/"*) ok "frame image for $EID: $R";; *) bad "frame image for $EID: $R";; esac
else bad "no mirrored event with an available image"; fi
CODE=$(curl -s --path-as-is -o /dev/null -w '%{http_code}' "$BASE/api/ai/v2/events/../../api/cameras")
[ "$CODE" = 404 ] && ok "image proxy rejects other viewer paths (HTTP 404)" || bad "image proxy traversal returned HTTP $CODE"

echo "== detections per class (local mirror) =="
CID=$(local_sql "SELECT camera_id FROM detection_events ORDER BY id DESC LIMIT 1")
CL=$(curl -s "$BASE/api/cameras/$CID/classes")
echo "$CL" | grep -q 'person' && ok "classes for $CID: $(echo "$CL" | head -c 200)" || bad "classes for $CID: $(echo "$CL" | head -c 200)"
ST=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/stats/classes")
[ "$ST" = 200 ] && ok "/api/stats/classes HTTP 200" || bad "/api/stats/classes HTTP $ST"

echo "== person-count WebSocket =="
WSPORT=$(grep -E '^PERSON_COUNT_WS_PORT=' .env | cut -d= -f2)
MSG=$(docker exec "$PROJECT-person-count-ws" node -e "
  const WebSocket = require('ws'); const ws = new WebSocket('ws://127.0.0.1:${WSPORT}');
  const t = setTimeout(() => { console.log('TIMEOUT'); process.exit(0); }, 8000);
  ws.on('message', m => { console.log(String(m)); clearTimeout(t); ws.close(); process.exit(0); });
  ws.on('error', e => { console.log('ERR ' + e.message); process.exit(0); });")
echo "$MSG" | grep -q '"type":"people_count"' && ok "WS message: $MSG" || bad "WS: $MSG"

echo "== sync (team DB -> local DB) =="
C1=$(local_sql "SELECT COUNT(*)||' '||COALESCE(MAX(id),0) FROM detection_events"); S1=$(source_max)
echo "      local count/max: $C1   source max: $S1   cursor: $(local_sql "SELECT last_team_id FROM sync_cursors WHERE table_name='detection_events'")"
sleep "${SYNC_WAIT:-30}"
C2=$(local_sql "SELECT COUNT(*)||' '||COALESCE(MAX(id),0) FROM detection_events"); S2=$(source_max)
echo "      local count/max: $C2   source max: $S2"
L2=${C2#* }
if [ "$L2" = "$S2" ]; then ok "mirror is at the source head (max id $L2)"; else bad "mirror max $L2 behind source max $S2"; fi
[ "$C1" != "$C2" ] && ok "mirror grew while waiting ($C1 -> $C2)" || echo "INFO  no new source rows during the wait (source max $S1 -> $S2)"

echo; echo "passed $PASS, failed $FAIL"
[ "$FAIL" = 0 ]
