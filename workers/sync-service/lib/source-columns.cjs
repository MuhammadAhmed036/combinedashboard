// SELECT list for the source detection_events, built from the columns that
// source actually has: YOLO Stage 2 installs differ (the plain Stage 2 table has
// no worker_id; some sites add it through a compat view). Missing optional
// columns are mirrored as NULL — raw_image_status as 'available', the local
// column's default (it is NOT NULL locally). No dependencies.

// Without these the mirror cannot work (keys, cursor, local NOT NULL columns).
const REQUIRED_SOURCE_COLUMNS = ["id", "event_id", "camera_id", "detection_ts", "detections_json", "created_at"];

const MISSING_DEFAULTS = { raw_image_status: "'available'" };

/**
 * @param {string[]} wanted   columns the mirror stores, in order
 * @param {Iterable<string>} present  columns of the source detection_events
 * @returns {{ list: string, missing: string[], missingRequired: string[] }}
 */
function buildSourceSelect(wanted, present) {
  const have = new Set(present);
  const missing = wanted.filter((c) => !have.has(c));
  const missingRequired = REQUIRED_SOURCE_COLUMNS.filter((c) => !have.has(c));
  const list = wanted
    .map((c) => (have.has(c) ? c : `${MISSING_DEFAULTS[c] || "NULL"} AS ${c}`))
    .join(",");
  return { list, missing, missingRequired };
}

module.exports = { buildSourceSelect, REQUIRED_SOURCE_COLUMNS };
