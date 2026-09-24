-- This app's own alert-match log (child of `alerts`), full CRUD in
-- src/lib/server/alertsStore.ts. Seeded once via the sync-service's
-- one-time migration, then owned entirely by this app going forward.
CREATE TABLE IF NOT EXISTS alert_events (
  id                     BIGSERIAL PRIMARY KEY,
  alert_id               TEXT NOT NULL REFERENCES alerts (alert_id) ON DELETE CASCADE,
  event_id               TEXT NOT NULL,
  camera_id              TEXT,
  detection_ts           TEXT,
  person_count_inside    INTEGER,
  person_count_outside   INTEGER,
  bounding_box           JSONB,
  detections_json        JSONB,
  save_mode              TEXT,
  note                   TEXT,
  seen                   BOOLEAN NOT NULL DEFAULT false,
  is_latest              BOOLEAN NOT NULL DEFAULT false,
  source_raw_image_path  TEXT,
  saved_image_path       TEXT,
  created_by             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (alert_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_events_alert_id ON alert_events (alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_event_id ON alert_events (event_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert_ts ON alert_events (alert_id, detection_ts DESC);
