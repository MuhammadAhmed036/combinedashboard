import { getPool } from "@/lib/server/db";

type Row = Record<string, unknown>;

function parseDetections(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeEventRow(row: Row): Row {
  return {
    ...row,
    detections: parseDetections(row.detections_json),
    image_exists: row.raw_image_status === "available",
  };
}

export interface ListEventsFilters {
  cameraId?: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}

export async function listEvents(
  filters: ListEventsFilters
): Promise<{ events: Row[]; total: number }> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT *, COUNT(*) OVER() AS total_count
     FROM detection_events
     WHERE ($1::text IS NULL OR camera_id = $1)
       AND ($2::timestamptz IS NULL OR detection_ts::timestamptz >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR detection_ts::timestamptz < $3::timestamptz)
     ORDER BY created_at DESC
     LIMIT $4`,
    [filters.cameraId ?? null, filters.dateFrom ?? null, filters.dateTo ?? null, filters.limit ?? 20]
  );
  const total = rows[0] ? Number(rows[0].total_count) || 0 : 0;
  const events = rows.map((row) => {
    const rest = { ...row };
    delete rest.total_count;
    return normalizeEventRow(rest);
  });
  return { events, total };
}

export async function getEventById(eventId: string): Promise<Row | null> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM detection_events WHERE event_id = $1`, [eventId]);
  return rows[0] ? normalizeEventRow(rows[0]) : null;
}
