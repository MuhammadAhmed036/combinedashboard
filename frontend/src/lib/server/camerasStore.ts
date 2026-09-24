import { getPool } from "@/lib/server/db";

type Row = Record<string, unknown>;

const CAMERA_CLASSES_SAMPLE_SIZE = 1500;

export interface CameraClasses {
  classNames: string[];
}

/**
 * Every distinct detection class this camera has recently reported —
 * whatever the model emits (not a fixed list), so a new class showing up in
 * the data appears here automatically. Bounded to the camera's most recent
 * events, not a full-table scan.
 */
export async function getCameraClasses(cameraId: string): Promise<CameraClasses> {
  const pool = getPool();
  const { rows } = await pool.query(
    `WITH recent AS (
       SELECT detections_json FROM detection_events
       WHERE camera_id = $1
       ORDER BY created_at DESC
       LIMIT $2
     )
     SELECT DISTINCT d ->> 'class_name' AS class_name
     FROM recent, LATERAL jsonb_array_elements(recent.detections_json::jsonb) AS d`,
    [cameraId, CAMERA_CLASSES_SAMPLE_SIZE]
  );
  const classNames = rows.map((row) => String(row.class_name)).filter(Boolean).sort();
  return { classNames };
}

export async function listCameras(limit = 1000): Promise<Row[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM camera_locations ORDER BY camera_name LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function getCamera(cameraId: string): Promise<Row | null> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM camera_locations WHERE camera_id = $1`, [
    cameraId,
  ]);
  return rows[0] ?? null;
}

export async function updateCameraCoords(
  cameraId: string,
  input: { latitude: number; longitude: number }
): Promise<Row | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO camera_locations (camera_id, camera_name, latitude, longitude, enabled, metadata)
     VALUES ($1, $2, $3, $4, true, '{}'::jsonb)
     ON CONFLICT (camera_id) DO UPDATE
       SET latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           updated_at = now()
     RETURNING *`,
    [cameraId, cameraId, input.latitude, input.longitude]
  );
  return rows[0] ?? null;
}

export interface CreateCameraInput {
  cameraId: string;
  cameraName: string;
  zone?: string | null;
  latitude: number;
  longitude: number;
}

/** Updates coordinates if the camera is already registered, otherwise inserts a fresh row. */
export async function createOrPlaceCamera(input: CreateCameraInput): Promise<Row> {
  const pool = getPool();
  const existing = await getCamera(input.cameraId);
  if (existing) {
    const updated = await updateCameraCoords(input.cameraId, {
      latitude: input.latitude,
      longitude: input.longitude,
    });
    return updated as Row;
  }
  const { rows } = await pool.query(
    `INSERT INTO camera_locations (camera_id, camera_name, zone, latitude, longitude, enabled, metadata)
     VALUES ($1, $2, $3, $4, $5, true, '{}'::jsonb)
     RETURNING *`,
    [input.cameraId, input.cameraName, input.zone ?? null, input.latitude, input.longitude]
  );
  return rows[0];
}

export interface SyncCamerasResult {
  added: number;
  before: number;
  after: number;
}

/** Upserts cameras seen in `detection_events` into `camera_locations` — never overwrites an existing row. */
export async function syncCamerasFromDetections(): Promise<SyncCamerasResult> {
  const pool = getPool();
  const { rows: beforeRows } = await pool.query(`SELECT COUNT(*)::int AS count FROM camera_locations`);
  const before = Number(beforeRows[0].count) || 0;

  const { rows: existingRows } = await pool.query(`SELECT camera_id FROM camera_locations`);
  const existingIds = new Set(existingRows.map((row) => row.camera_id));

  const { rows: detected } = await pool.query(
    `SELECT DISTINCT ON (camera_id) camera_id, camera_ip, zone, scene
     FROM detection_events
     WHERE camera_id IS NOT NULL
     ORDER BY camera_id, created_at DESC`
  );

  let added = 0;
  for (const cam of detected) {
    if (existingIds.has(cam.camera_id)) continue;
    await pool.query(
      `INSERT INTO camera_locations (camera_id, camera_name, camera_ip, zone, scene, enabled, metadata)
       VALUES ($1, $1, $2, $3, $4, true, '{}'::jsonb)`,
      [cam.camera_id, cam.camera_ip, cam.zone, cam.scene]
    );
    added++;
  }

  return { added, before, after: before + added };
}

export async function listZoneSummaries(): Promise<Row[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT zone,
            COUNT(*) AS camera_count,
            COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS with_coords,
            COUNT(*) FILTER (WHERE enabled) AS enabled_count
     FROM camera_locations
     WHERE zone IS NOT NULL
     GROUP BY zone
     ORDER BY zone`
  );
  return rows;
}

function parseBucketSeconds(bucket: string): number {
  const match = /^(\d+)([smh])$/.exec(bucket);
  if (!match) return 300;
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "h" ? 3600 : unit === "m" ? 60 : 1;
  return value * multiplier;
}

export interface PeopleCountSeriesOptions {
  fromTs: string;
  toTs: string;
  bucket?: string;
  mode?: string;
}

export interface PeopleCountPointRow {
  time: string;
  people_count: number;
  event_count: number;
}

export async function getPeopleCountSeries(
  cameraId: string,
  options: PeopleCountSeriesOptions
): Promise<PeopleCountPointRow[]> {
  const pool = getPool();
  const bucketSeconds = parseBucketSeconds(options.bucket ?? "5m");
  const mode = options.mode === "latest" ? "latest" : "max";

  const { rows } = await pool.query(
    `WITH bucketed AS (
       SELECT
         to_timestamp(floor(extract(epoch FROM detection_ts::timestamptz) / $1) * $1) AS bucket_time,
         detection_count,
         detection_ts
       FROM detection_events
       WHERE camera_id = $2
         AND detection_ts::timestamptz >= $3::timestamptz
         AND detection_ts::timestamptz < $4::timestamptz
     )
     SELECT bucket_time,
            COUNT(*) AS event_count,
            MAX(detection_count) AS max_count,
            (ARRAY_AGG(detection_count ORDER BY detection_ts DESC))[1] AS latest_count
     FROM bucketed
     GROUP BY bucket_time
     ORDER BY bucket_time`,
    [bucketSeconds, cameraId, options.fromTs, options.toTs]
  );

  return rows.map((row) => ({
    time: (row.bucket_time as Date).toISOString(),
    people_count: Number(mode === "latest" ? row.latest_count : row.max_count) || 0,
    event_count: Number(row.event_count) || 0,
  }));
}
