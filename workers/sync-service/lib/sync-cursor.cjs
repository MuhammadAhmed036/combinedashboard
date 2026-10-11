// Where the detection_events mirror starts reading the source. No
// dependencies: used by sync-service and tests.

/**
 * @param {object} p
 * @param {number|null} p.savedCursor      sync_cursors row for detection_events, null when none yet
 * @param {number} p.localMaxId            MAX(id) already in the mirror (0 when empty)
 * @param {number|null} p.backfillHours    SYNC_BACKFILL_HOURS, null/undefined when unset
 * @param {number|null} p.firstIdInWindow  first source id with created_at >= now - backfillHours (null: none)
 * @param {number} p.sourceMaxId           MAX(id) in the source
 * @returns {{ cursor: number, reason: string }}
 */
function chooseStartCursor({ savedCursor, localMaxId, backfillHours, firstIdInWindow, sourceMaxId }) {
  // An existing cursor is never changed here.
  if (savedCursor !== null && savedCursor !== undefined) return { cursor: savedCursor, reason: "saved cursor" };
  if (!backfillHours) return { cursor: localMaxId, reason: "no cursor yet: mirror max id (full history when empty)" };
  // Nothing in the window: start at the source head, so only new rows are copied.
  const windowStart = firstIdInWindow === null || firstIdInWindow === undefined ? sourceMaxId : firstIdInWindow - 1;
  // Never go back below rows the mirror already has.
  return { cursor: Math.max(localMaxId, windowStart), reason: `no cursor yet: last ${backfillHours}h only` };
}

module.exports = { chooseStartCursor };
