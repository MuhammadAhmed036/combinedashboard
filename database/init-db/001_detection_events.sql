-- Local mirror of the team's `detection_events` table (yolo_events DB).
-- Source of truth stays with the team's detection pipeline; this app never
-- writes here, only the sync-service does (see sync-service/index.js).
--
-- Only the columns this dashboard's API routes / person-count-ws actually
-- read are mirrored (23 of the source table's 37 columns) — deliberately
-- excludes purely pipeline-internal fields (source_subject, output_subject,
-- tags_json, event_json, payload_bytes, annotated_image_path, worker_ip,
-- receiver_id, model_version, application_name, raw_image_deleted_at,
-- raw_image_delete_reason, raw_image_retention_*) that nothing in this repo
-- reads.
--
-- `id` is NOT a local serial/identity: it's copied verbatim from the source
-- row so person-count-ws's `id > lastSeenId` cursor logic keeps working
-- against the mirror unchanged.
CREATE TABLE IF NOT EXISTS detection_events (
  id                BIGINT PRIMARY KEY,
  event_id          TEXT NOT NULL UNIQUE,
  camera_id         TEXT,
  camera_ip         TEXT,
  zone              TEXT,
  scene             TEXT,
  detection_ts      TEXT NOT NULL,
  model_name        TEXT,
  backend           TEXT,
  device            TEXT,
  image_width       INTEGER,
  image_height      INTEGER,
  detection_count   INTEGER,
  decode_ms         DOUBLE PRECISION,
  preprocess_ms     DOUBLE PRECISION,
  inference_ms      DOUBLE PRECISION,
  postprocess_ms    DOUBLE PRECISION,
  total_ms          DOUBLE PRECISION,
  detections_json   TEXT NOT NULL,
  raw_image_path    TEXT,
  raw_image_status  TEXT NOT NULL DEFAULT 'available',
  worker_id         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index shapes chosen to match the actual query patterns in
-- src/lib/server/{eventsStore,camerasStore,statsStore}.ts and person-count-ws.
CREATE INDEX IF NOT EXISTS idx_detection_events_camera_created
  ON detection_events (camera_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_detection_events_camera_worker_created
  ON detection_events (camera_id, worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_detection_events_camera_ts
  ON detection_events (camera_id, detection_ts);
CREATE INDEX IF NOT EXISTS idx_detection_events_ts
  ON detection_events (detection_ts);
CREATE INDEX IF NOT EXISTS idx_detection_events_created_at
  ON detection_events (created_at);
