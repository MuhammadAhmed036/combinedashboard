// Standalone service: keeps this app's local Postgres database in sync with
// the team's shared `yolo_events` database.
//
//   - `detection_events` is owned by the team's detection pipeline. Mirrored
//     continuously (read-only against the team DB) — new rows via an id
//     cursor, plus a bounded reconciliation pass for rows whose
//     `raw_image_status` can still flip (e.g. 'available' -> 'deleted' once
//     the retention worker purges the image).
//   - `camera_locations` is mirrored from the team DB into this deployment's
//     local DB so new/updated cameras show up without touching the app.
//   - `alerts` / `alert_events` are managed locally by this deployment.
//     Historical team-alert sync helpers are intentionally disabled near the
//     bottom of this file.
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// Same fallback pattern as person-count-ws/index.js: this service has no
// framework auto-loading .env, so fall back to the project's root .env for
// anything not already present in process.env.
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

const TEAM_DATABASE_URL = process.env.TEAM_DATABASE_URL;
const LOCAL_DATABASE_URL = process.env.DATABASE_URL;
if (!TEAM_DATABASE_URL) {
  console.error("[sync] TEAM_DATABASE_URL is not configured (checked process env and root .env fallback)");
  process.exit(1);
}
if (!LOCAL_DATABASE_URL) {
  console.error("[sync] DATABASE_URL is not configured (checked process env and root .env fallback)");
  process.exit(1);
}

const SYNC_POLL_MS = Number(process.env.SYNC_POLL_MS) || 3000;
const SYNC_RECONCILE_MS = Number(process.env.SYNC_RECONCILE_MS) || 60000;
const SYNC_BATCH_LIMIT = Number(process.env.SYNC_BATCH_LIMIT) || 2000;
const SYNC_MAX_BATCHES_PER_POLL = Number(process.env.SYNC_MAX_BATCHES_PER_POLL) || 20;
const SYNC_RECONCILE_LIMIT = Number(process.env.SYNC_RECONCILE_LIMIT) || 5000;
const OPEN_RAW_IMAGE_STATUSES = ["available", "deleting"];

const team = new Pool({ connectionString: TEAM_DATABASE_URL });
const local = new Pool({ connectionString: LOCAL_DATABASE_URL });

// pg-pool requires an 'error' listener on every Pool — without one, a
// dropped idle connection (e.g. a transient ECONNRESET on a flaky network
// link to the team DB) becomes an unhandled exception that kills the whole
// process. The pool itself already discards the broken client and opens a
// fresh one on the next query, so logging is all that's needed here.
team.on("error", (error) => console.error("[sync] team pool idle-client error:", error.message));
local.on("error", (error) => console.error("[sync] local pool idle-client error:", error.message));

// Only the columns src/lib/server/*Store.ts and person-count-ws actually
// read — see docker/init-db/001_detection_events.sql for the full rationale.
const DETECTION_EVENTS_COLUMNS = [
  "id", "event_id", "camera_id", "camera_ip", "zone", "scene", "detection_ts",
  "model_name", "backend", "device", "image_width", "image_height", "detection_count",
  "decode_ms", "preprocess_ms", "inference_ms", "postprocess_ms", "total_ms",
  "detections_json", "raw_image_path", "raw_image_status", "worker_id", "created_at",
];

const CAMERA_LOCATIONS_COLUMNS = [
  "id", "camera_id", "camera_name", "camera_ip", "zone", "scene",
  "latitude", "longitude", "heading_degrees", "address", "building", "floor",
  "description", "enabled", "metadata", "created_by", "created_at", "updated_at",
];
const ALERTS_COLUMNS = [
  "id", "alert_id", "camera_id", "zone", "label", "name", "description",
  "source_event_id", "bounding_box", "conditions", "person_count_inside",
  "person_count_outside", "seen_count", "unseen_count", "seen", "seen_by",
  "seen_at", "status", "latest_event_id", "metadata", "created_by",
  "created_at", "updated_at",
];
const ALERT_EVENTS_COLUMNS = [
  "id", "alert_id", "event_id", "camera_id", "detection_ts",
  "person_count_inside", "person_count_outside", "bounding_box",
  "detections_json", "save_mode", "note", "seen", "is_latest",
  "source_raw_image_path", "saved_image_path", "created_by", "created_at",
];

const ALERTS_SYNC_COLUMNS = ALERTS_COLUMNS.filter(
  (c) => !["id", "seen", "seen_by", "seen_at", "seen_count", "unseen_count"].includes(c)
);
const ALERTS_JSON_COLUMNS = ["bounding_box", "conditions", "metadata"];
const ALERT_EVENTS_SYNC_COLUMNS = ALERT_EVENTS_COLUMNS.filter((c) => !["id", "seen"].includes(c));
const ALERT_EVENTS_JSON_COLUMNS = ["bounding_box", "detections_json"];

// Postgres rejects a query with more than 65535 bind parameters — one
// giant multi-row VALUES clause for a large table (e.g. 16k+ alert_events
// rows x 17 columns) blows past that. Chunking keeps every INSERT well
// under the limit regardless of table width or row count.
const MAX_ROWS_PER_UPSERT = 1000;

// node-postgres auto-parses jsonb columns into live JS values on read, then
// on write special-cases `Array.isArray(value)` as a Postgres ARRAY literal
// instead of JSON-encoding it — which corrupts any jsonb column whose value
// happens to be a JSON array (e.g. alerts.seen_by, or an alert_events row
// whose detections_json is array-shaped). Stringifying jsonb values
// ourselves before they become query parameters sidesteps that entirely.
function buildUpsert(table, columns, conflictColumns, jsonColumns = []) {
  const updateSet = columns
    .filter((c) => !conflictColumns.includes(c))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  async function upsertChunk(pool, rows) {
    if (rows.length === 0) return;
    const values = [];
    const tuples = rows.map((row, i) => {
      const base = i * columns.length;
      for (const col of columns) {
        const value = row[col];
        values.push(jsonColumns.includes(col) && value !== null ? JSON.stringify(value) : value);
      }
      return `(${columns.map((_, j) => `$${base + j + 1}`).join(",")})`;
    });
    await pool.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")}
       ON CONFLICT (${conflictColumns.join(",")}) DO UPDATE SET ${updateSet}`,
      values
    );
  }
  return async function upsert(pool, rows) {
    for (let i = 0; i < rows.length; i += MAX_ROWS_PER_UPSERT) {
      await upsertChunk(pool, rows.slice(i, i + MAX_ROWS_PER_UPSERT));
    }
  };
}

const upsertDetectionEvents = buildUpsert("detection_events", DETECTION_EVENTS_COLUMNS, ["id"]);
const cameraLocationsUpsert = buildUpsert(
  "camera_locations",
  CAMERA_LOCATIONS_COLUMNS.filter((c) => c !== "id"),
  ["camera_id"],
  ["metadata"]
);
const alertsUpsert = buildUpsert("alerts", ALERTS_SYNC_COLUMNS, ["alert_id"], ALERTS_JSON_COLUMNS);
const alertEventsUpsert = buildUpsert("alert_events", ALERT_EVENTS_SYNC_COLUMNS, ["alert_id", "event_id"], ALERT_EVENTS_JSON_COLUMNS);

let lastSyncedId = 0;

async function saveTeamCursor(table, value) {
  await local.query(
    `INSERT INTO sync_cursors (table_name, last_team_id) VALUES ($1, $2)
     ON CONFLICT (table_name) DO UPDATE SET last_team_id = EXCLUDED.last_team_id`,
    [table, value]
  );
}

async function loadCursor() {
  const { rows: cursorRows } = await local.query(
    "SELECT last_team_id FROM sync_cursors WHERE table_name = 'detection_events'"
  );
  if (cursorRows.length > 0) {
    lastSyncedId = Number(cursorRows[0].last_team_id) || 0;
  } else {
    const { rows: maxRows } = await local.query("SELECT COALESCE(MAX(id), 0) AS max_id FROM detection_events");
    lastSyncedId = Number(maxRows[0].max_id) || 0;
  }

  try {
    const { rows: teamMaxRows } = await team.query("SELECT COALESCE(MAX(id), 0) AS max_id FROM detection_events");
    const teamMaxId = Number(teamMaxRows[0].max_id) || 0;
    if (teamMaxId > 0 && teamMaxId < lastSyncedId) {
      console.log(`[sync] Team DB max id (${teamMaxId}) is smaller than local cursor (${lastSyncedId}). Resetting cursor to 0.`);
      lastSyncedId = 0;
    }
  } catch (e) {
    console.error("[sync] error checking team DB max id:", e.message);
  }

  console.log(`[sync] resuming detection_events cursor at id=${lastSyncedId}`);
}

async function syncNewDetectionEvents() {
  let totalRows = 0;
  for (let batchNo = 0; batchNo < SYNC_MAX_BATCHES_PER_POLL; batchNo++) {
    const { rows } = await team.query(
      `SELECT ${DETECTION_EVENTS_COLUMNS.join(",")} FROM detection_events
       WHERE id > $1 ORDER BY id ASC LIMIT $2`,
      [lastSyncedId, SYNC_BATCH_LIMIT]
    );
    if (rows.length === 0) break;

    await upsertDetectionEvents(local, rows);
    lastSyncedId = rows.reduce((max, row) => Math.max(max, Number(row.id)), lastSyncedId);
    await saveTeamCursor("detection_events", lastSyncedId);
    totalRows += rows.length;

    try {
      await evaluateDetectionEventsForAlerts(rows);
    } catch (err) {
      console.error("[sync] server-side alert evaluation error:", err.message);
    }

    if (rows.length < SYNC_BATCH_LIMIT) break;
  }

  if (totalRows > 0) {
    console.log(`[sync] mirrored ${totalRows} new detection_events row(s), cursor=${lastSyncedId}`);
  }
}

// Mirror camera_locations from Team DB continuously so any updated or new cameras land locally.
// Keep local rows that are backed by detection_events even when the team camera registry
// is incomplete; those cameras still need map placement and live monitoring.
async function syncCameraLocations() {
  const { rows } = await team.query(
    `SELECT ${CAMERA_LOCATIONS_COLUMNS.join(",")} FROM camera_locations ORDER BY id ASC`
  );
  if (rows.length === 0) return;
  await cameraLocationsUpsert(local, rows);

  const teamCameraIds = rows.map((r) => r.camera_id).filter(Boolean);
  if (teamCameraIds.length > 0) {
    await local.query(
      `DELETE FROM camera_locations cl
       WHERE NOT (cl.camera_id = ANY($1::text[]))
         AND NOT EXISTS (
           SELECT 1 FROM detection_events de WHERE de.camera_id = cl.camera_id
         )`,
      [teamCameraIds]
    );
  }
}

// Server-side alert detection engine: evaluates detection events against active rules
async function evaluateDetectionEventsForAlerts(events) {
  if (!events || events.length === 0) return;

  const { rows: activeRules } = await local.query(
    `SELECT id, alert_id, camera_id, name, bounding_box, conditions, metadata FROM alerts WHERE status = 'active'`
  );
  if (activeRules.length === 0) return;

  const rulesByCamera = new Map();
  for (const rule of activeRules) {
    if (!rule.camera_id) continue;
    const cid = String(rule.camera_id).toLowerCase();
    if (!rulesByCamera.has(cid)) rulesByCamera.set(cid, []);
    rulesByCamera.get(cid).push(rule);
  }

  for (const event of events) {
    const cid = String(event.camera_id || "").toLowerCase();
    const rules = rulesByCamera.get(cid);
    if (!rules || rules.length === 0) continue;

    let rawDet = event.detections_json;
    let detections = [];
    if (typeof rawDet === "string") {
      try {
        detections = JSON.parse(rawDet);
      } catch (e) {
        detections = [];
      }
    } else if (Array.isArray(rawDet)) {
      detections = rawDet;
    } else if (rawDet && Array.isArray(rawDet.detections)) {
      detections = rawDet.detections;
    }

    const imgW = Number(event.image_width) || 1920;
    const imgH = Number(event.image_height) || 1080;

    for (const rule of rules) {
      const conditions = rule.conditions || {};
      const metadata = rule.metadata || {};
      const conditionType = conditions.condition || "boundary";

      if (conditionType === "boundary") {
        const bbox = rule.bounding_box;
        const refW = Number(metadata.ref_image_width) || imgW;
        const refH = Number(metadata.ref_image_height) || imgH;
        if (!bbox || !refW || !refH) continue;

        const region = {
          x1: bbox.x1 / refW,
          y1: bbox.y1 / refH,
          x2: bbox.x2 / refW,
          y2: bbox.y2 / refH,
        };

        const classNames =
          Array.isArray(conditions.class_names) && conditions.class_names.length > 0
            ? conditions.class_names.map((c) => String(c).toLowerCase())
            : ["person"];

        const wanted = new Set(classNames);

        const boxes = [];
        for (const d of detections) {
          const cName = String(d.class_name || "").toLowerCase();
          if (!wanted.has(cName)) continue;
          if (Array.isArray(d.bbox_norm_xyxy) && d.bbox_norm_xyxy.length === 4) {
            boxes.push({
              x1: d.bbox_norm_xyxy[0],
              y1: d.bbox_norm_xyxy[1],
              x2: d.bbox_norm_xyxy[2],
              y2: d.bbox_norm_xyxy[3],
            });
          } else if (Array.isArray(d.bbox_xyxy) && d.bbox_xyxy.length === 4) {
            boxes.push({
              x1: d.bbox_xyxy[0] / imgW,
              y1: d.bbox_xyxy[1] / imgH,
              x2: d.bbox_xyxy[2] / imgW,
              y2: d.bbox_xyxy[3] / imgH,
            });
          }
        }

        if (boxes.length === 0) continue;

        const insideBoxes = boxes.filter(
          (b) => b.x1 < region.x2 && b.x2 > region.x1 && b.y1 < region.y2 && b.y2 > region.y1
        );
        const outsideBoxes = boxes.filter(
          (b) => !(b.x1 < region.x2 && b.x2 > region.x1 && b.y1 < region.y2 && b.y2 > region.y1)
        );

        const triggerOutside = Boolean(conditions.trigger_outside);
        const fires = triggerOutside ? outsideBoxes.length > 0 : insideBoxes.length > 0;
        if (!fires) continue;

        await insertAlertEventIfNew({
          alertId: rule.alert_id,
          eventId: event.event_id,
          cameraId: event.camera_id,
          detectionTs: event.detection_ts || null,
          personCountInside: insideBoxes.length,
          personCountOutside: outsideBoxes.length,
          boundingBox: JSON.stringify(bbox),
          detectionsJson: JSON.stringify({ inside: insideBoxes.length, outside: outsideBoxes.length }),
          note: triggerOutside
            ? `Server engine auto-detected (${classNames.join(", ")} outside zone)`
            : `Server engine auto-detected (${classNames.join(", ")})`,
        });
      }
    }
  }
}

// Person boxes (0–1 normalized) from a detection_events row's detections_json,
// which the mirror stores as TEXT. Mirrors the parsing in
// evaluateDetectionEventsForAlerts / the dashboard's detectionBoxes.ts.
function personBoxesFromRow(row) {
  let raw = row.detections_json;
  let detections = [];
  if (typeof raw === "string") {
    try {
      detections = JSON.parse(raw);
    } catch {
      detections = [];
    }
  } else if (Array.isArray(raw)) {
    detections = raw;
  } else if (raw && Array.isArray(raw.detections)) {
    detections = raw.detections;
  }
  if (!Array.isArray(detections)) return [];

  const imgW = Number(row.image_width) || 1920;
  const imgH = Number(row.image_height) || 1080;
  const boxes = [];
  for (const d of detections) {
    if (String(d.class_name || "").toLowerCase() !== "person") continue;
    if (Array.isArray(d.bbox_norm_xyxy) && d.bbox_norm_xyxy.length === 4) {
      boxes.push({ x1: d.bbox_norm_xyxy[0], y1: d.bbox_norm_xyxy[1], x2: d.bbox_norm_xyxy[2], y2: d.bbox_norm_xyxy[3] });
    } else if (Array.isArray(d.bbox_xyxy) && d.bbox_xyxy.length === 4) {
      boxes.push({
        x1: d.bbox_xyxy[0] / imgW,
        y1: d.bbox_xyxy[1] / imgH,
        x2: d.bbox_xyxy[2] / imgW,
        y2: d.bbox_xyxy[3] / imgH,
      });
    }
  }
  return boxes;
}

// The drawn "Restricted Zone" of an absence rule in 0–1 coords, or null for a
// frame-wide rule (any person anywhere counts as presence).
function absenceRuleRegion(rule) {
  const bbox = rule.bounding_box;
  const meta = rule.metadata || {};
  const refW = Number(meta.ref_image_width);
  const refH = Number(meta.ref_image_height);
  if (!bbox || !refW || !refH) return null;
  if (![bbox.x1, bbox.y1, bbox.x2, bbox.y2].every((v) => typeof v === "number")) return null;
  return { x1: bbox.x1 / refW, y1: bbox.y1 / refH, x2: bbox.x2 / refW, y2: bbox.y2 / refH };
}

function boxesOverlap(a, b) {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

// Whether a detection frame still shows a person the rule cares about: anywhere
// in frame for a frame-wide rule, inside the drawn zone for a zone-scoped one.
function framePersonPresent(row, region) {
  if (region) {
    return personBoxesFromRow(row).some((box) => boxesOverlap(box, region));
  }
  return Number(row.detection_count) > 0;
}

async function openAbsenceEvent(rule, snapshot, absentSinceMs) {
  await local.query(
    `INSERT INTO absence_events (
       alert_id, camera_id, started_at, snapshot_event_id, snapshot_path
     ) VALUES ($1, $2, to_timestamp($3 / 1000.0), $4, $5)
     ON CONFLICT DO NOTHING`,
    [
      rule.alert_id,
      rule.camera_id,
      absentSinceMs,
      snapshot.event_id,
      snapshot.raw_image_path || null,
    ]
  );
}

async function closeAbsenceEvent(rule, presentAtMs) {
  await local.query(
    `UPDATE absence_events
     SET ended_at = to_timestamp($2 / 1000.0),
         duration_seconds = GREATEST(0, round($2 / 1000.0 - extract(epoch from started_at)))::integer
     WHERE alert_id = $1 AND ended_at IS NULL`,
    [rule.alert_id, presentAtMs]
  );
}

async function insertAlertEventIfNew({
  alertId,
  eventId,
  cameraId,
  detectionTs,
  personCountInside,
  personCountOutside,
  boundingBox,
  detectionsJson,
  sourceRawImagePath = null,
  note,
  createdBy = "server-detection-engine",
}) {
  if (!alertId || !eventId) return false;

  const client = await local.connect();
  try {
    await client.query("BEGIN");
    // DB-level idempotency even if the old deployed DB is missing the
    // UNIQUE(alert_id, event_id) constraint from docker/init-db.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [alertId, eventId]);

    const existing = await client.query(
      "SELECT id FROM alert_events WHERE alert_id = $1 AND event_id = $2 LIMIT 1",
      [alertId, eventId]
    );
    if (existing.rows.length > 0) {
      await client.query("COMMIT");
      console.log(`[sync] duplicate alert event ignored alert_id=${alertId} event_id=${eventId}`);
      return false;
    }

    await client.query(
      "UPDATE alert_events SET is_latest = false WHERE alert_id = $1 AND is_latest = true",
      [alertId]
    );
    await client.query(
      `INSERT INTO alert_events (
         alert_id, event_id, camera_id, detection_ts, person_count_inside, person_count_outside,
         bounding_box, detections_json, source_raw_image_path, note, seen, is_latest, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, true, $11)`,
      [
        alertId,
        eventId,
        cameraId,
        detectionTs || null,
        personCountInside,
        personCountOutside,
        boundingBox,
        detectionsJson,
        sourceRawImagePath,
        note,
        createdBy,
      ]
    );
    await client.query(
      `UPDATE alerts
       SET unseen_count = unseen_count + 1,
           latest_event_id = $2,
           person_count_inside = $3,
           person_count_outside = $4,
           updated_at = COALESCE($5::timestamptz, now())
       WHERE alert_id = $1`,
      [alertId, eventId, personCountInside, personCountOutside, detectionTs || null]
    );
    await client.query("COMMIT");
    console.log(`[sync] alert event persisted alert_id=${alertId} event_id=${eventId} created_by=${createdBy}`);
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error && error.code === "23505") {
      console.log(`[sync] duplicate alert event ignored alert_id=${alertId} event_id=${eventId}`);
      return false;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function evaluateAbsenceRules() {
  const { rows: absenceRules } = await local.query(
    `SELECT alert_id, camera_id, name, bounding_box, conditions, metadata FROM alerts WHERE status = 'active' AND conditions->>'condition' = 'absence'`
  );
  if (absenceRules.length === 0) return;

  for (const rule of absenceRules) {
    const conditions = rule.conditions || {};
    const thresholdSec = Number(conditions.absence_threshold_seconds) || 60;
    const region = absenceRuleRegion(rule);

    // Recent frames, newest first — enough history to (a) pick a frame that
    // actually shows the empty scene and (b) find when a person was last seen.
    const { rows: recent } = await local.query(
      `SELECT event_id, detection_ts, created_at, detection_count, detections_json,
              image_width, image_height, raw_image_path, raw_image_status
       FROM detection_events WHERE camera_id = $1 ORDER BY id DESC LIMIT 30`,
      [rule.camera_id]
    );
    if (recent.length === 0) continue;

    const now = Date.now();
    const latest = recent[0];
    const latestMs = new Date(latest.created_at || latest.detection_ts).getTime();
    const silentForSec = (now - latestMs) / 1000;

    // A person in the latest frame closes the durable absence period.
    if (framePersonPresent(latest, region)) {
      await closeAbsenceEvent(rule, latestMs);
      continue;
    }

    // Absent when the newest frame is clear, OR the worker has gone quiet for
    // the whole threshold window (empty scene → detections stop altogether).

    // Snapshot: newest recent frame that still has its raw image AND shows no
    // person for this rule. Falls back to the newest frame that has an image
    // (worker went silent → the last real frame is the best we can show).
    const hasImage = (r) => r.raw_image_status === "available" && r.event_id;
    const snapshot =
      recent.find((r) => hasImage(r) && !framePersonPresent(r, region)) ||
      recent.find(hasImage) ||
      latest;

    // Absence started right after the most recent frame that showed a person;
    // if none is in view, at least a threshold-window ago.
    const lastPresent = recent.find((r) => framePersonPresent(r, region));
    const absentSinceMs = lastPresent
      ? new Date(lastPresent.created_at || lastPresent.detection_ts).getTime()
      : latestMs - thresholdSec * 1000;
    const absentSec = Math.max(thresholdSec, Math.round((now - absentSinceMs) / 1000));

    const { rows: openRows } = await local.query(
      `SELECT id FROM absence_events WHERE alert_id = $1 AND ended_at IS NULL LIMIT 1`,
      [rule.alert_id]
    );
    if (openRows.length > 0) continue;

    const inZone = region ? " in zone" : "";
    await insertAlertEventIfNew({
      alertId: rule.alert_id,
      eventId: snapshot.event_id,
      cameraId: rule.camera_id,
      detectionTs: snapshot.detection_ts || new Date(now).toISOString(),
      personCountInside: 0,
      personCountOutside: 0,
      boundingBox: region ? JSON.stringify(rule.bounding_box) : null,
      detectionsJson: JSON.stringify({ inside: 0, outside: 0 }),
      sourceRawImagePath: snapshot.raw_image_path || null,
      note: `No person detected${inZone} for ~${Math.round(absentSec / 60)}m (threshold ${Math.round(thresholdSec / 60)}m)`,
    });
    await openAbsenceEvent(rule, snapshot, absentSinceMs);
  }
}

// Each table syncs independently so a transient failure on one (e.g. a
// network drop mid-fetch) doesn't stall progress on the others.
async function pollLoop() {
  for (const [label, task] of [
    ["detection_events", syncNewDetectionEvents],
    ["camera_locations", syncCameraLocations],
    ["absence_evaluator", evaluateAbsenceRules],
  ]) {
    try {
      await task();
    } catch (error) {
      console.error(`[sync] ${label} poll error:`, error.message);
    }
  }
  setTimeout(pollLoop, SYNC_POLL_MS);
}

async function reconcileOpenDetectionEvents() {
  const { rows: openRows } = await local.query(
    `SELECT id, raw_image_status FROM detection_events
     WHERE raw_image_status = ANY($1)
     ORDER BY id DESC LIMIT $2`,
    [OPEN_RAW_IMAGE_STATUSES, SYNC_RECONCILE_LIMIT]
  );
  if (openRows.length === 0) return;

  const ids = openRows.map((r) => r.id);
  const { rows: teamRows } = await team.query(
    `SELECT id, raw_image_status FROM detection_events WHERE id = ANY($1)`,
    [ids]
  );
  const teamMap = new Map(teamRows.map((r) => [Number(r.id), r.raw_image_status]));

  for (const row of openRows) {
    const teamStatus = teamMap.get(Number(row.id));
    if (teamStatus && teamStatus !== row.raw_image_status) {
      await local.query(
        `UPDATE detection_events SET raw_image_status = $1 WHERE id = $2`,
        [teamStatus, row.id]
      );
    }
  }
}

async function reconcileLoop() {
  try {
    await reconcileOpenDetectionEvents();
  } catch (error) {
    console.error("[sync] reconcile error:", error.message);
  } finally {
    setTimeout(reconcileLoop, SYNC_RECONCILE_MS);
  }
}

// One-time migration for camera_locations: copies the team DB's existing rows in once.
async function migrateOwnTableOnce(table, columns, jsonColumns = []) {
  const { rows: countRows } = await local.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
  if (Number(countRows[0].c) > 0) {
    console.log(`[sync] ${table} already has local rows, skipping one-time migration`);
    return;
  }
  const { rows } = await team.query(`SELECT ${columns.join(",")} FROM ${table}`);
  if (rows.length === 0) {
    console.log(`[sync] ${table} has no rows on the team DB, nothing to migrate`);
    return;
  }
  const insert = buildUpsert(table, columns, ["id"], jsonColumns);
  await insert(local, rows);
  await local.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'), (SELECT MAX(id) FROM ${table}))`,
    [table]
  );
  console.log(`[sync] migrated ${rows.length} row(s) into ${table}`);
}

async function syncNewAlerts() {
  // Disabled: local alerts are managed locally and not pulled from team DB.
}

async function pushPendingLocalAlerts() {
  // Disabled: local alerts are managed locally.
}

async function syncNewAlertEvents() {
  // Disabled: local alert events are generated locally.
}

async function migrateOwnTablesOnce() {
  await migrateOwnTableOnce("camera_locations", CAMERA_LOCATIONS_COLUMNS, ["metadata"]);
}

async function ensureAlertEventUniqueness() {
  const { rows: duplicateRows } = await local.query(
    `SELECT alert_id, event_id, COUNT(*)::int AS duplicate_count
     FROM alert_events
     GROUP BY alert_id, event_id
     HAVING COUNT(*) > 1
     LIMIT 5`
  );
  if (duplicateRows.length > 0) {
    console.warn("[sync] alert_events contains historical duplicates; future duplicates are blocked, but add a cleanup migration before adding the DB unique constraint.");
    for (const row of duplicateRows) {
      console.warn(`[sync] duplicate sample alert_id=${row.alert_id} event_id=${row.event_id} count=${row.duplicate_count}`);
    }
    return;
  }

  try {
    await local.query(
      "ALTER TABLE alert_events ADD CONSTRAINT alert_events_alert_id_event_id_key UNIQUE (alert_id, event_id)"
    );
    console.log("[sync] alert_events unique constraint ensured on (alert_id, event_id)");
  } catch (error) {
    if (error && (error.code === "42710" || error.code === "42P07")) {
      console.log("[sync] alert_events unique constraint already present");
      return;
    }
    throw error;
  }
}

async function main() {
  await ensureAlertEventUniqueness();
  await migrateOwnTablesOnce();
  await loadCursor();
  await syncNewDetectionEvents();
  pollLoop();
  reconcileLoop();
  console.log(`[sync] running (poll every ${SYNC_POLL_MS}ms, batch ${SYNC_BATCH_LIMIT} x ${SYNC_MAX_BATCHES_PER_POLL}, reconcile every ${SYNC_RECONCILE_MS}ms)`);
}

main().catch((error) => {
  console.error("[sync] fatal startup error:", error);
  process.exit(1);
});

function shutdown() {
  console.log("[sync] shutting down");
  Promise.allSettled([team.end(), local.end()]).finally(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

