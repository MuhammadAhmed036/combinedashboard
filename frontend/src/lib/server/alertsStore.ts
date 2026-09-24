import { randomUUID } from "crypto";
import { getPool } from "@/lib/server/db";

type Row = Record<string, unknown>;

const EVENT_COUNT_JOIN = `
  LEFT JOIN (
    SELECT alert_id, COUNT(*) AS event_count FROM alert_events GROUP BY alert_id
  ) ec ON ec.alert_id = a.alert_id
`;

function withEventCount(row: Row): Row {
  return { ...row, event_count: Number(row.event_count) || 0 };
}

export interface ListAlertsFilters {
  status?: string;
  cameraId?: string;
  zone?: string;
  seen?: boolean;
  q?: string;
  limit?: number;
}

export async function listAlerts(filters: ListAlertsFilters): Promise<Row[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT a.*, COALESCE(ec.event_count, 0) AS event_count
     FROM alerts a
     ${EVENT_COUNT_JOIN}
     WHERE ($1::text IS NULL OR a.status = $1)
       AND ($2::text IS NULL OR a.camera_id = $2)
       AND ($3::text IS NULL OR a.zone = $3)
       AND ($4::boolean IS NULL OR a.seen = $4)
       AND ($5::text IS NULL OR a.name ILIKE '%' || $5 || '%' OR a.label ILIKE '%' || $5 || '%' OR a.description ILIKE '%' || $5 || '%')
     ORDER BY a.created_at DESC
     LIMIT $6`,
    [
      filters.status ?? null,
      filters.cameraId ?? null,
      filters.zone ?? null,
      filters.seen ?? null,
      filters.q ?? null,
      filters.limit ?? 200,
    ]
  );
  return rows.map(withEventCount);
}

export async function getAlertStats(): Promise<{
  total: number;
  seen: number;
  unseen: number;
  byStatus: Record<string, number>;
}> {
  const pool = getPool();
  const [totals, byStatusRows] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE seen) AS seen,
              COUNT(*) FILTER (WHERE NOT seen) AS unseen
       FROM alerts`
    ),
    pool.query(`SELECT status, COUNT(*) AS count FROM alerts GROUP BY status`),
  ]);
  const totalsRow = totals.rows[0] as Row;
  const byStatus: Record<string, number> = {};
  for (const row of byStatusRows.rows as Row[]) {
    byStatus[String(row.status)] = Number(row.count) || 0;
  }
  return {
    total: Number(totalsRow.total) || 0,
    seen: Number(totalsRow.seen) || 0,
    unseen: Number(totalsRow.unseen) || 0,
    byStatus,
  };
}

export async function getAlertByAlertId(alertId: string): Promise<Row | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT a.*, COALESCE(ec.event_count, 0) AS event_count
     FROM alerts a
     ${EVENT_COUNT_JOIN}
     WHERE a.alert_id = $1`,
    [alertId]
  );
  return rows[0] ? withEventCount(rows[0]) : null;
}

export interface CreateAlertInput {
  cameraId: string;
  zone?: string | null;
  name: string;
  label: string;
  description?: string | null;
  sourceEventId?: string | null;
  boundingBox?: Record<string, unknown> | null;
  conditions: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: string;
  createdBy?: string | null;
}

export async function createAlert(input: CreateAlertInput): Promise<Row> {
  const pool = getPool();
  const alertId = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO alerts (
       alert_id, camera_id, zone, label, name, description, source_event_id,
       bounding_box, conditions, person_count_inside, person_count_outside,
       status, metadata, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,$10,$11,$12)
     RETURNING *`,
    [
      alertId,
      input.cameraId,
      input.zone ?? null,
      input.label,
      input.name,
      input.description ?? null,
      input.sourceEventId ?? null,
      JSON.stringify(input.boundingBox ?? {}),
      JSON.stringify(input.conditions),
      input.status,
      JSON.stringify(input.metadata),
      input.createdBy ?? null,
    ]
  );
  return withEventCount(rows[0]);
}

export async function updateAlertStatus(alertId: string, status: string): Promise<Row | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE alerts SET status = $2, updated_at = now() WHERE alert_id = $1 RETURNING *`,
    [alertId, status]
  );
  if (!rows[0]) return null;
  return getAlertByAlertId(alertId);
}

export async function deleteAlert(alertId: string): Promise<boolean> {
  const pool = getPool();
  const client = await pool.connect();
  let deletedLocally = false;
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM alert_events WHERE alert_id = $1`, [alertId]);
    const result = await client.query(`DELETE FROM alerts WHERE alert_id = $1`, [alertId]);
    await client.query("COMMIT");
    deletedLocally = (result.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return deletedLocally;
}

export async function listAlertEvents(alertId: string, limit = 100): Promise<Row[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM alert_events
     WHERE alert_id = $1
     ORDER BY COALESCE(detection_ts::timestamptz, created_at) DESC
     LIMIT $2`,
    [alertId, limit]
  );
  return rows;
}

export async function listAbsenceEvents(alertId: string, limit = 100): Promise<Row[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, alert_id, camera_id, started_at, ended_at, duration_seconds,
            snapshot_event_id, snapshot_path, created_at
     FROM absence_events
     WHERE alert_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [alertId, limit]
  );
  return rows;
}

export async function getAbsenceDailySummary(alertId: string, dayStart: string): Promise<Row> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN ended_at IS NOT NULL THEN duration_seconds ELSE
         EXTRACT(EPOCH FROM (LEAST(now(), date_trunc('day', $2::timestamptz) + interval '1 day') - started_at))::integer END), 0) AS absent_seconds,
       COUNT(*) AS absence_events
     FROM absence_events
     WHERE alert_id = $1
       AND started_at < date_trunc('day', $2::timestamptz) + interval '1 day'
       AND COALESCE(ended_at, now()) >= date_trunc('day', $2::timestamptz)`,
    [alertId, dayStart]
  );
  return rows[0] ?? { absent_seconds: 0, absence_events: 0 };
}

export interface AppendAlertEventInput {
  eventId: string;
  detectionTs?: string | null;
  personCountInside?: number;
  personCountOutside?: number;
  boundingBox?: Record<string, unknown> | null;
  /** Per-class breakdown of the match, e.g. `{inside: {person: 2, car: 5}, outside: {}}`. */
  detectionsJson?: Record<string, unknown> | null;
  note?: string | null;
  createdBy?: string | null;
}

/** Returns null if the parent alert doesn't exist. */
export async function appendAlertEvent(
  alertId: string,
  input: AppendAlertEventInput
): Promise<Row | null> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
      alertId,
      input.eventId,
    ]);

    const alertRows = await client.query(`SELECT camera_id FROM alerts WHERE alert_id = $1 FOR UPDATE`, [
      alertId,
    ]);
    if (!alertRows.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const cameraId = alertRows.rows[0].camera_id as string;

    const existing = await client.query(
      `SELECT * FROM alert_events WHERE alert_id = $1 AND event_id = $2 LIMIT 1`,
      [alertId, input.eventId]
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return existing.rows[0];
    }

    await client.query(
      `UPDATE alert_events SET is_latest = false WHERE alert_id = $1 AND is_latest = true`,
      [alertId]
    );
    const inserted = await client.query(
      `INSERT INTO alert_events (
         alert_id, event_id, camera_id, detection_ts, person_count_inside, person_count_outside,
         bounding_box, detections_json, note, seen, is_latest, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,true,$10)
       RETURNING *`,
      [
        alertId,
        input.eventId,
        cameraId,
        input.detectionTs ?? null,
        input.personCountInside ?? 0,
        input.personCountOutside ?? 0,
        JSON.stringify(input.boundingBox ?? null),
        JSON.stringify(input.detectionsJson ?? null),
        input.note ?? null,
        input.createdBy ?? null,
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
      [
        alertId,
        input.eventId,
        input.personCountInside ?? 0,
        input.personCountOutside ?? 0,
        input.detectionTs ?? null,
      ]
    );
    await client.query("COMMIT");
    return inserted.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      const { rows } = await pool.query(
        `SELECT * FROM alert_events WHERE alert_id = $1 AND event_id = $2 LIMIT 1`,
        [alertId, input.eventId]
      );
      return rows[0] ?? null;
    }
    throw error;
  } finally {
    client.release();
  }
}

export interface SetAlertSeenInput {
  user?: string | null;
  seen?: boolean;
}

/** Returns null if the alert doesn't exist. */
export async function setAlertSeen(alertId: string, input: SetAlertSeenInput): Promise<Row | null> {
  const pool = getPool();
  const markSeen = input.seen !== false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`SELECT 1 FROM alerts WHERE alert_id = $1 FOR UPDATE`, [
      alertId,
    ]);
    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(`UPDATE alert_events SET seen = $2 WHERE alert_id = $1`, [alertId, markSeen]);

    if (markSeen) {
      await client.query(
        `UPDATE alerts
         SET seen = true,
             seen_by = CASE
               WHEN $2::text IS NULL THEN seen_by
               WHEN seen_by @> to_jsonb($2::text) THEN seen_by
               ELSE seen_by || to_jsonb($2::text)
             END,
             seen_at = now(),
             seen_count = seen_count + unseen_count,
             unseen_count = 0,
             updated_at = now()
         WHERE alert_id = $1`,
        [alertId, input.user ?? null]
      );
    } else {
      await client.query(
        `UPDATE alerts
         SET seen = false,
             unseen_count = seen_count + unseen_count,
             seen_count = 0,
             updated_at = now()
         WHERE alert_id = $1`,
        [alertId]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getAlertByAlertId(alertId);
}
