-- This app's own alert-rule table (full CRUD lives in
-- src/lib/server/alertsStore.ts). Seeded once from the team DB's existing
-- rows by the sync-service's one-time migration, then owned entirely by
-- this app going forward.
--
-- `collection_id`/`collection_name` from the source table are deliberately
-- dropped: nothing in this app ever writes them, and 0 of the existing rows
-- had a non-null collection_id at migration time.
CREATE TABLE IF NOT EXISTS alerts (
  id                    BIGSERIAL PRIMARY KEY,
  alert_id              TEXT NOT NULL UNIQUE,
  camera_id             TEXT NOT NULL,
  zone                  TEXT,
  label                 TEXT,
  name                  TEXT,
  description           TEXT,
  source_event_id       TEXT,
  bounding_box          JSONB NOT NULL DEFAULT '{}'::jsonb,
  conditions            JSONB NOT NULL DEFAULT '{}'::jsonb,
  person_count_inside   INTEGER NOT NULL DEFAULT 0,
  person_count_outside  INTEGER NOT NULL DEFAULT 0,
  seen_count            INTEGER NOT NULL DEFAULT 0,
  unseen_count          INTEGER NOT NULL DEFAULT 0,
  seen                  BOOLEAN NOT NULL DEFAULT false,
  seen_by               JSONB NOT NULL DEFAULT '[]'::jsonb,
  seen_at               TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'active',
  latest_event_id       TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL means "created locally, not yet pushed to the team DB" — set by
  -- the sync-service once it successfully pushes the row, or immediately
  -- when a row arrives FROM the team DB in the first place (see
  -- sync-service/index.js).
  pushed_to_team_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_camera_id ON alerts (camera_id);
CREATE INDEX IF NOT EXISTS idx_alerts_zone ON alerts (zone);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status);
CREATE INDEX IF NOT EXISTS idx_alerts_seen ON alerts (seen);
CREATE INDEX IF NOT EXISTS idx_alerts_pending_team_push ON alerts (id) WHERE pushed_to_team_at IS NULL;
