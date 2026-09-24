import type { DashboardStats, TrendPoint } from "@/lib/types";
import {
  ACTIVE_ALERT_TREND,
  CROWD_DENSITY_TODAY,
  OFFLINE_CAMERAS_TREND,
  PEOPLE_COUNT_TODAY,
  PERSON_COUNT_TREND,
} from "@/lib/mock/trends";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function numeric(record: UnknownRecord, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

/**
 * There's no single "total persons detected" aggregate endpoint in the
 * detection API. `/api/v2/events` returns a `total` row count in its
 * response envelope even with `limit=1`, so a date-ranged query gets an
 * accurate count for a day without paginating through every event.
 * This counts detection *events*, not summed `detection_count` (which would
 * require fetching every matching row — too expensive to poll repeatedly).
 */
async function fetchEventCountInRange(dateFrom: string, dateTo: string): Promise<number> {
  const params = new URLSearchParams({ limit: "1", date_from: dateFrom, date_to: dateTo });
  const response = await fetch(`/api/events?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Events API returned ${response.status}`);
  const payload = asRecord(await response.json());
  return numeric(payload, ["total"]);
}

async function fetchPersonsTodaySummary(): Promise<{ total: number; trendPercent: number }> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const [todayCount, yesterdayCount] = await Promise.all([
    fetchEventCountInRange(todayStart.toISOString(), now.toISOString()),
    fetchEventCountInRange(yesterdayStart.toISOString(), todayStart.toISOString()),
  ]);

  const trendPercent =
    yesterdayCount > 0 ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 1000) / 10 : 0;

  return { total: todayCount, trendPercent };
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const [statsResponse, personsToday] = await Promise.all([
    fetch("/api/stats", { cache: "no-store" }),
    fetchPersonsTodaySummary(),
  ]);
  if (!statsResponse.ok) throw new Error(`Stats API returned ${statsResponse.status}`);

  const payload = asRecord(await statsResponse.json());
  const stats = asRecord(payload.data ?? payload.stats ?? payload);
  const totalCameras = numeric(stats, ["totalCameras", "total_cameras", "camera_count"]);
  const activeCameras = numeric(stats, [
    "activeCameras",
    "active_cameras",
    "online_cameras",
  ]);

  return {
    totalCameras,
    activeCameras,
    offlineCameras: numeric(
      stats,
      ["offlineCameras", "offline_cameras"],
      Math.max(0, totalCameras - activeCameras)
    ),
    totalPersonsToday: personsToday.total,
    personsTrendPercent: personsToday.trendPercent,
    activeAlerts: numeric(stats, ["activeAlerts", "active_alerts", "alert_count"]),
    criticalAlerts: numeric(stats, ["criticalAlerts", "critical_alerts"]),
    offlineCamerasTrendPercent: numeric(stats, [
      "offlineCamerasTrendPercent",
      "offline_cameras_trend_percent",
    ]),
    activeAlertTrendPercent: numeric(stats, [
      "activeAlertTrendPercent",
      "active_alert_trend_percent",
    ]),
  };
}

export type TrendKey =
  | "people-count-today"
  | "crowd-density-today"
  | "person-count-trend"
  | "active-alert-trend"
  | "offline-cameras-trend";

const TRENDS: Record<TrendKey, TrendPoint[]> = {
  "people-count-today": PEOPLE_COUNT_TODAY,
  "crowd-density-today": CROWD_DENSITY_TODAY,
  "person-count-trend": PERSON_COUNT_TREND,
  "active-alert-trend": ACTIVE_ALERT_TREND,
  "offline-cameras-trend": OFFLINE_CAMERAS_TREND,
};

export async function fetchTrend(key: TrendKey): Promise<TrendPoint[]> {
  return TRENDS[key];
}

/** Live per-class object counts summed across all cameras, e.g. `{person: 3, car: 12}`. */
export async function fetchLiveClassCounts(): Promise<Record<string, number>> {
  const response = await fetch("/api/stats/classes", { cache: "no-store" });
  if (!response.ok) throw new Error(`Live class counts API returned ${response.status}`);
  const payload = (await response.json()) as { counts?: unknown };
  const counts = asRecord(payload.counts);
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts)) {
    const n = Number(value);
    if (Number.isFinite(n)) result[key] = n;
  }
  return result;
}

export interface CameraClassCounts {
  cameraId: string;
  cameraName: string;
  counts: Record<string, number>;
}

function normalizeCameraClassCounts(raw: unknown): CameraClassCounts {
  const record = asRecord(raw);
  const rawCounts = asRecord(record.counts);
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawCounts)) {
    const n = Number(value);
    if (Number.isFinite(n)) counts[key] = n;
  }
  return {
    cameraId: String(record.cameraId ?? ""),
    cameraName: String(record.cameraName ?? record.cameraId ?? ""),
    counts,
  };
}

/** Live per-class object counts, one entry per camera. */
export async function fetchLiveClassCountsByCamera(): Promise<CameraClassCounts[]> {
  const response = await fetch("/api/stats/classes/by-camera", { cache: "no-store" });
  if (!response.ok) throw new Error(`Live class counts by camera API returned ${response.status}`);
  const payload = (await response.json()) as { cameras?: unknown };
  const rows = Array.isArray(payload.cameras) ? payload.cameras : [];
  return rows.map(normalizeCameraClassCounts);
}

/** Peak per-class count each camera reached in the last hour. */
export async function fetchClassDensityLastHour(): Promise<CameraClassCounts[]> {
  const response = await fetch("/api/stats/classes/density-last-hour", { cache: "no-store" });
  if (!response.ok) throw new Error(`Class density last-hour API returned ${response.status}`);
  const payload = (await response.json()) as { cameras?: unknown };
  const rows = Array.isArray(payload.cameras) ? payload.cameras : [];
  return rows.map(normalizeCameraClassCounts);
}

export interface ClassTrendPoint {
  time: string;
  counts: Record<string, number>;
}

/** Fleet-wide multi-class time series — how many of each class were detected per time bucket, across all cameras. */
export async function fetchClassTrendSeries(options: {
  fromTs: string;
  toTs: string;
  bucketSeconds?: number;
}): Promise<ClassTrendPoint[]> {
  const params = new URLSearchParams({ from_ts: options.fromTs, to_ts: options.toTs });
  if (options.bucketSeconds) params.set("bucket_seconds", String(options.bucketSeconds));
  const response = await fetch(`/api/stats/classes/series?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Class trend series API returned ${response.status}`);
  const payload = (await response.json()) as { points?: unknown };
  const rows = Array.isArray(payload.points) ? payload.points : [];
  return rows.map((raw: unknown) => {
    const record = asRecord(raw);
    const rawCounts = asRecord(record.counts);
    const counts: Record<string, number> = {};
    for (const [key, value] of Object.entries(rawCounts)) {
      const n = Number(value);
      if (Number.isFinite(n)) counts[key] = n;
    }
    return { time: String(record.time ?? ""), counts };
  });
}
