-- Durable source of truth for check-post absence periods.
CREATE TABLE IF NOT EXISTS absence_events (
  id                  BIGSERIAL PRIMARY KEY,
  alert_id            TEXT NOT NULL REFERENCES alerts (alert_id) ON DELETE CASCADE,
  camera_id           TEXT NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL,
  ended_at            TIMESTAMPTZ,
  duration_seconds    INTEGER,
  snapshot_event_id   TEXT,
  snapshot_path       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_absence_events_open
  ON absence_events (alert_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_absence_events_alert_started
  ON absence_events (alert_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_absence_events_started
  ON absence_events (started_at DESC);
