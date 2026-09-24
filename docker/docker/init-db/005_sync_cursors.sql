-- Tracks, per team-DB table, the highest team-side numeric `id` the
-- sync-service has already pulled in for tables merged on a natural key
-- (alerts, alert_events) rather than on `id` itself — see sync-service/
-- index.js for why those two can't use `id` as the merge key.
CREATE TABLE IF NOT EXISTS sync_cursors (
  table_name   TEXT PRIMARY KEY,
  last_team_id BIGINT NOT NULL DEFAULT 0
);
