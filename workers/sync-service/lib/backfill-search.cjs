// First sync / mirror reset with SYNC_BACKFILL_HOURS: find the first source row
// created at or after `sinceMs` WITHOUT scanning the table (the Stage 2 table
// has no created_at index). Binary search over the primary key with single-row
// index lookups (`WHERE id >= $1 ORDER BY id LIMIT 1`), assuming created_at
// grows with id (rows are inserted in time order). ~log2(rows) probes.
// No dependencies; `probe` is supplied by the caller (tests use a fake).

/**
 * @param {object} p
 * @param {(id: number) => Promise<{ id: number, createdAtMs: number } | null>} p.probe
 *        first row with id >= the given id, or null when none
 * @param {number} p.minId   smallest id in the table
 * @param {number} p.maxId   largest id in the table
 * @param {number} p.sinceMs
 * @param {number} [p.maxProbes]
 * @returns {Promise<{ firstId: number | null, probes: number }>} null firstId = no row that recent
 */
async function findFirstIdSince({ probe, minId, maxId, sinceMs, maxProbes = 80 }) {
  let probes = 0;
  const at = async (id) => {
    probes += 1;
    return probe(id);
  };
  const last = await at(maxId);
  if (!last || last.createdAtMs < sinceMs) return { firstId: null, probes };
  const first = await at(minId);
  if (first && first.createdAtMs >= sinceMs) return { firstId: first.id, probes };
  // Search ids in (lo, ub]: the row at/after lo is older than sinceMs, `answer`
  // is the smallest recent row id found so far. Every probe halves ub - lo.
  let lo = minId;
  let ub = last.id;
  let answer = last.id;
  while (ub - lo > 1 && probes < maxProbes) {
    const mid = lo + Math.floor((ub - lo) / 2);
    const row = await at(mid);
    if (!row || row.id >= ub) {
      ub = mid; // no row in [mid, ub)
    } else if (row.createdAtMs >= sinceMs) {
      answer = row.id;
      ub = row.id;
    } else {
      lo = row.id;
    }
  }
  return { firstId: answer, probes };
}

module.exports = { findFirstIdSince };
