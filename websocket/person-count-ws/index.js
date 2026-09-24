// Standalone service: polls `detection_events` directly and broadcasts each
// camera's latest people-count over WebSocket. The dashboard's browser
// connects to this service directly (same pattern as DETECTION_API_BASE_URL
// / CAMERA_FEED_BASE_URL — see DEPLOY.md) instead of through the Next.js
// container.
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { WebSocketServer } = require("ws");

// This service has no framework auto-loading .env for it (unlike the
// Next.js app) — when run directly with `node person-count-ws/index.js`,
// nothing sets these unless the shell exported them first. Fall back to
// reading the project's own root .env (single source of truth for this
// deployment) for any var not already present in the environment.
function loadRootEnvFallback() {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(__dirname, ".env"),
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", "..", ".env"),
  ];
  const envPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!envPath) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadRootEnvFallback();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not configured (checked process env and root .env fallback)");
  process.exit(1);
}

const WS_PORT = Number(process.env.WS_PORT) || 8090;
const POLL_MS = Number(process.env.POLL_MS) || 2000;
const POLL_BATCH_LIMIT = 500;

const pool = new Pool({ connectionString: DATABASE_URL });

/** @type {Map<string, {camera_id: string, camera_name: string, zone: string|null, people_count: number, event_id: string, time: string}>} */
const latestByCamera = new Map();
let lastSeenId = 0;

function toMessage(state) {
  return JSON.stringify({
    type: "people_count",
    camera_id: state.camera_id,
    camera_name: state.camera_name,
    zone: state.zone,
    people_count: state.people_count,
    event_id: state.event_id,
    time: state.time,
  });
}

function broadcast(state) {
  const payload = toMessage(state);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

function applyRow(row) {
  const state = {
    camera_id: row.camera_id,
    camera_name: row.camera_name ?? row.camera_id,
    zone: row.zone ?? null,
    people_count: Number(row.detection_count) || 0,
    event_id: row.event_id,
    time: (row.detection_ts ?? row.created_at)?.toString?.() ?? new Date().toISOString(),
  };
  latestByCamera.set(state.camera_id, state);
  return state;
}

async function loadInitialSnapshot() {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (de.camera_id)
       de.id, de.camera_id, de.event_id, de.detection_count, de.detection_ts, de.created_at,
       cl.camera_name, cl.zone
     FROM detection_events de
     LEFT JOIN camera_locations cl ON cl.camera_id = de.camera_id
     WHERE de.camera_id IS NOT NULL
     ORDER BY de.camera_id, de.created_at DESC`
  );
  lastSeenId = 0;
  for (const row of rows) {
    applyRow(row);
    const rowId = Number(row.id);
    if (rowId > lastSeenId) lastSeenId = rowId;
  }
  const { rows: maxRows } = await pool.query("SELECT COALESCE(MAX(id), 0) AS max_id FROM detection_events");
  const dbMaxId = Number(maxRows[0].max_id) || 0;
  if (dbMaxId < lastSeenId) {
    lastSeenId = dbMaxId;
  }
  console.log(`[person-count-ws] loaded initial snapshot for ${latestByCamera.size} camera(s), lastSeenId=${lastSeenId}`);
}

async function pollOnce() {
  const { rows: maxRows } = await pool.query("SELECT COALESCE(MAX(id), 0) AS max_id FROM detection_events");
  const dbMaxId = Number(maxRows[0].max_id) || 0;
  if (dbMaxId < lastSeenId) {
    console.log(`[person-count-ws] DB max id (${dbMaxId}) < lastSeenId (${lastSeenId}). Resetting lastSeenId to ${dbMaxId}.`);
    lastSeenId = dbMaxId;
  }

  const { rows } = await pool.query(
    `SELECT de.id, de.camera_id, de.event_id, de.detection_count, de.detection_ts, de.created_at,
            cl.camera_name, cl.zone
     FROM detection_events de
     LEFT JOIN camera_locations cl ON cl.camera_id = de.camera_id
     WHERE de.id > $1 AND de.camera_id IS NOT NULL
     ORDER BY de.id ASC
     LIMIT $2`,
    [lastSeenId, POLL_BATCH_LIMIT]
  );
  if (rows.length === 0) return;

  const changedByCamera = new Map();
  for (const row of rows) {
    changedByCamera.set(row.camera_id, applyRow(row));
    const rowId = Number(row.id);
    if (rowId > lastSeenId) lastSeenId = rowId;
  }
  for (const state of changedByCamera.values()) broadcast(state);
}

async function pollLoop() {
  try {
    await pollOnce();
  } catch (error) {
    console.error("[person-count-ws] poll error:", error.message);
  } finally {
    setTimeout(pollLoop, POLL_MS);
  }
}

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (socket) => {
  for (const state of latestByCamera.values()) {
    socket.send(toMessage(state));
  }
});

wss.on("listening", () => {
  console.log(`[person-count-ws] listening on :${WS_PORT}`);
});

async function main() {
  await loadInitialSnapshot();
  pollLoop();
}

main().catch((error) => {
  console.error("[person-count-ws] fatal startup error:", error);
  process.exit(1);
});

function shutdown() {
  console.log("[person-count-ws] shutting down");
  wss.close();
  pool.end().finally(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

