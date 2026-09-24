-- This app's own camera registry: seeded once from the team DB's existing
-- rows by the sync-service's one-time migration, then owned entirely by
-- this app going forward (coordinate placement via PATCH /api/cameras/[id],
-- new cameras discovered via POST /api/cameras/sync reading the local
-- detection_events mirror). The team DB's copy is no longer written to
-- after migration.
CREATE TABLE IF NOT EXISTS camera_locations (
  id               BIGSERIAL PRIMARY KEY,
  camera_id        TEXT NOT NULL UNIQUE,
  camera_name      TEXT NOT NULL,
  camera_ip        TEXT,
  zone             TEXT,
  scene            TEXT,
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  heading_degrees  DOUBLE PRECISION,
  address          TEXT,
  building         TEXT,
  floor            TEXT,
  description      TEXT,
  enabled          BOOLEAN NOT NULL DEFAULT true,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camera_locations_zone ON camera_locations (zone);
CREATE INDEX IF NOT EXISTS idx_camera_locations_enabled ON camera_locations (enabled);
CREATE INDEX IF NOT EXISTS idx_camera_locations_has_coords
  ON camera_locations (zone) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
