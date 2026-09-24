import { getPool } from "@/lib/server/db";

const ACTIVE_CAMERA_WINDOW = "5 minutes";

export interface DashboardStatsRow {
  total_cameras: number;
  active_cameras: number;
  offline_cameras: number;
  active_alerts: number;
  critical_alerts: number;
  offline_cameras_trend_percent: number;
  active_alert_trend_percent: number;
}

export async function getDashboardStats(): Promise<DashboardStatsRow> {
  const pool = getPool();
  const [cameraStats, alertStats] = await Promise.all([
    pool.query(
      `WITH camera_activity AS (
         SELECT cl.camera_id, MAX(de.created_at) AS last_seen
         FROM camera_locations cl
         LEFT JOIN detection_events de ON de.camera_id = cl.camera_id
         GROUP BY cl.camera_id
       )
       SELECT
         COUNT(*) AS total_cameras,
         COUNT(*) FILTER (WHERE last_seen > now() - interval '${ACTIVE_CAMERA_WINDOW}') AS active_cameras
       FROM camera_activity`
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active') AS active_alerts,
         COUNT(*) FILTER (WHERE status = 'active' AND metadata->>'category' = 'critical') AS critical_alerts
       FROM alerts`
    ),
  ]);

  const totalCameras = Number(cameraStats.rows[0].total_cameras) || 0;
  const activeCameras = Number(cameraStats.rows[0].active_cameras) || 0;

  return {
    total_cameras: totalCameras,
    active_cameras: activeCameras,
    offline_cameras: Math.max(0, totalCameras - activeCameras),
    active_alerts: Number(alertStats.rows[0].active_alerts) || 0,
    critical_alerts: Number(alertStats.rows[0].critical_alerts) || 0,
    // Not derivable from anything in the schema — no historical baseline to trend against.
    offline_cameras_trend_percent: 0,
    active_alert_trend_percent: 0,
  };
}

const LIVE_CLASS_COUNTS_WINDOW = "60 seconds";
const CLASS_DENSITY_HOUR_BUCKET_SECONDS = 300;

function parseClassNames(detectionsJson: unknown): string[] {
  if (typeof detectionsJson !== "string") return [];
  let detections: unknown;
  try {
    detections = JSON.parse(detectionsJson);
  } catch {
    return [];
  }
  if (!Array.isArray(detections)) return [];
  const names: string[] = [];
  for (const detection of detections) {
    const className = (detection as { class_name?: unknown } | null)?.class_name;
    if (typeof className === "string" && className) names.push(className);
  }
  return names;
}

/**
 * Live per-class object counts summed across all cameras — e.g.
 * `{person: 3, car: 12, truck: 2}`. Different detection classes for the same
 * camera can come from different worker rows (a person-worker row and a
 * vehicle-worker row for the same camera_id, written independently) rather
 * than one row with everything — so this takes each camera+worker's latest
 * row within a short recent window, not just the single latest row per
 * camera, or a vehicle-only reading would silently zero out that camera's
 * person count (and vice versa).
 */
export async function getLiveClassCounts(): Promise<Record<string, number>> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (camera_id, worker_id) detections_json
     FROM detection_events
     WHERE camera_id IS NOT NULL AND created_at > now() - interval '${LIVE_CLASS_COUNTS_WINDOW}'
     ORDER BY camera_id, worker_id, created_at DESC`
  );

  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const className of parseClassNames(row.detections_json)) {
      counts[className] = (counts[className] ?? 0) + 1;
    }
  }
  return counts;
}

export interface CameraClassCounts {
  cameraId: string;
  cameraName: string;
  counts: Record<string, number>;
}

/** Same "latest per camera+worker in a recent window" logic as `getLiveClassCounts`, kept per camera instead of summed. */
export async function getLiveClassCountsByCamera(): Promise<CameraClassCounts[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (de.camera_id, de.worker_id) de.camera_id, cl.camera_name, de.detections_json
     FROM detection_events de
     LEFT JOIN camera_locations cl ON cl.camera_id = de.camera_id
     WHERE de.camera_id IS NOT NULL AND de.created_at > now() - interval '${LIVE_CLASS_COUNTS_WINDOW}'
     ORDER BY de.camera_id, de.worker_id, de.created_at DESC`
  );

  const byCamera = new Map<string, CameraClassCounts>();
  for (const row of rows) {
    const cameraId = String(row.camera_id);
    const entry: CameraClassCounts = byCamera.get(cameraId) ?? {
      cameraId,
      cameraName: row.camera_name ?? cameraId,
      counts: {} as Record<string, number>,
    };
    for (const className of parseClassNames(row.detections_json)) {
      entry.counts[className] = (entry.counts[className] ?? 0) + 1;
    }
    byCamera.set(cameraId, entry);
  }
  return Array.from(byCamera.values());
}

/**
 * Peak per-class count each camera reached in any 5-minute bucket over the
 * last hour — the class-aware counterpart to the single-number "peak
 * density" the old camera-density-last-hour endpoint reports.
 */
export async function getClassDensityLastHour(): Promise<CameraClassCounts[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `WITH windowed AS (
       SELECT camera_id, event_id, detection_ts, detections_json
       FROM detection_events
       WHERE camera_id IS NOT NULL AND created_at > now() - interval '1 hour'
     ),
     -- One row per (camera, frame, class): how many of that class appeared in
     -- THIS single frame. Grouping by event_id here (not just camera+bucket)
     -- is what keeps this a per-frame occupancy count instead of a running
     -- total of every detection logged across the whole bucket.
     per_frame AS (
       SELECT camera_id, event_id,
              to_timestamp(floor(extract(epoch FROM detection_ts::timestamptz) / $1) * $1) AS bucket_time,
              d ->> 'class_name' AS class_name,
              COUNT(*) AS frame_count
       FROM windowed, LATERAL jsonb_array_elements(detections_json::jsonb) AS d
       GROUP BY camera_id, event_id, bucket_time, class_name
     ),
     per_bucket AS (
       SELECT camera_id, bucket_time, class_name, MAX(frame_count) AS bucket_peak
       FROM per_frame
       GROUP BY camera_id, bucket_time, class_name
     )
     SELECT pb.camera_id, cl.camera_name, pb.class_name, MAX(pb.bucket_peak) AS peak_count
     FROM per_bucket pb
     LEFT JOIN camera_locations cl ON cl.camera_id = pb.camera_id
     GROUP BY pb.camera_id, cl.camera_name, pb.class_name`,
    [CLASS_DENSITY_HOUR_BUCKET_SECONDS]
  );

  const byCamera = new Map<string, CameraClassCounts>();
  for (const row of rows) {
    const cameraId = String(row.camera_id);
    const entry: CameraClassCounts = byCamera.get(cameraId) ?? {
      cameraId,
      cameraName: row.camera_name ?? cameraId,
      counts: {} as Record<string, number>,
    };
    const className = row.class_name;
    if (typeof className === "string" && className) {
      entry.counts[className] = Number(row.peak_count) || 0;
    }
    byCamera.set(cameraId, entry);
  }
  return Array.from(byCamera.values());
}

export interface ClassTrendPoint {
  time: string;
  counts: Record<string, number>;
}

export interface ClassTrendOptions {
  fromTs: string;
  toTs: string;
  bucketSeconds?: number;
}

/**
 * Fleet-wide multi-class time series — per bucket, each camera's own peak
 * simultaneous count of a class (not a running total of every detection
 * logged in that window), summed across cameras. Mirrors how the existing
 * person-only aggregate trend is built (per-camera peak-per-bucket, then
 * summed) — see `fetchAggregatePeopleCountSeries` in cameraLocationsService.ts.
 */
export async function getClassTrendSeries(options: ClassTrendOptions): Promise<ClassTrendPoint[]> {
  const pool = getPool();
  const bucketSeconds = options.bucketSeconds ?? 300;
  const { rows } = await pool.query(
    `WITH windowed AS (
       SELECT camera_id, event_id, detection_ts, detections_json
       FROM detection_events
       WHERE camera_id IS NOT NULL
         AND detection_ts::timestamptz >= $1::timestamptz AND detection_ts::timestamptz < $2::timestamptz
     ),
     per_frame AS (
       SELECT camera_id, event_id,
              to_timestamp(floor(extract(epoch FROM detection_ts::timestamptz) / $3) * $3) AS bucket_time,
              d ->> 'class_name' AS class_name,
              COUNT(*) AS frame_count
       FROM windowed, LATERAL jsonb_array_elements(detections_json::jsonb) AS d
       GROUP BY camera_id, event_id, bucket_time, class_name
     ),
     per_camera_bucket AS (
       SELECT camera_id, bucket_time, class_name, MAX(frame_count) AS peak_count
       FROM per_frame
       GROUP BY camera_id, bucket_time, class_name
     )
     SELECT bucket_time, class_name, SUM(peak_count) AS count
     FROM per_camera_bucket
     GROUP BY bucket_time, class_name
     ORDER BY bucket_time`,
    [options.fromTs, options.toTs, bucketSeconds]
  );

  const byBucket = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const time = (row.bucket_time as Date).toISOString();
    const counts = byBucket.get(time) ?? {};
    const className = row.class_name;
    if (typeof className === "string" && className) {
      counts[className] = Number(row.count) || 0;
    }
    byBucket.set(time, counts);
  }
  return Array.from(byBucket.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, counts]) => ({ time, counts }));
}

export interface CameraRetentionRow {
  camera_id: string;
  total_events: number;
  with_raw: number;
  retained_raw: number;
  target: number;
  remaining_to_target: number;
  latest_ts: string | null;
}

export async function getCameraRetention(): Promise<CameraRetentionRow[]> {
  const pool = getPool();
  const target = Number(process.env.RAW_IMAGE_RETENTION_TARGET) || 100;
  const { rows } = await pool.query(
    `SELECT camera_id,
            COUNT(*) AS total_events,
            COUNT(*) FILTER (WHERE raw_image_path IS NOT NULL) AS with_raw,
            COUNT(*) FILTER (WHERE raw_image_status = 'available') AS retained_raw,
            MAX(detection_ts) AS latest_ts
     FROM detection_events
     WHERE camera_id IS NOT NULL
     GROUP BY camera_id
     ORDER BY camera_id`
  );
  return rows.map((row) => {
    const retainedRaw = Number(row.retained_raw) || 0;
    return {
      camera_id: row.camera_id,
      total_events: Number(row.total_events) || 0,
      with_raw: Number(row.with_raw) || 0,
      retained_raw: retainedRaw,
      target,
      remaining_to_target: Math.max(0, target - retainedRaw),
      latest_ts: row.latest_ts ?? null,
    };
  });
}
