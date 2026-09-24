import type { CameraEventDetail, CameraEventDetection, CameraRetentionInfo } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  const detail = asRecord(body).detail ?? asRecord(body).error;
  if (typeof detail === "string") return detail;
  return fallback;
}

function normalizeDetection(raw: unknown): CameraEventDetection | null {
  const record = asRecord(raw);
  const bbox = record.bbox_xyxy as [number, number, number, number] | undefined;
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  return {
    classId: asNumber(record.class_id) ?? 0,
    className: String(record.class_name ?? "unknown"),
    confidence: asNumber(record.confidence) ?? 0,
    bboxXyxy: bbox,
  };
}

function normalizeCameraEvent(raw: unknown): CameraEventDetail {
  const record = asRecord(raw);
  const detections = Array.isArray(record.detections)
    ? record.detections.map(normalizeDetection).filter((d): d is CameraEventDetection => d !== null)
    : [];

  return {
    eventId: String(record.event_id ?? ""),
    cameraId: String(record.camera_id ?? ""),
    cameraIp: asString(record.camera_ip),
    zone: asString(record.zone),
    scene: asString(record.scene),
    detectionTs: asString(record.detection_ts),
    modelName: asString(record.model_name),
    backend: asString(record.backend),
    device: asString(record.device),
    imageWidth: asNumber(record.image_width),
    imageHeight: asNumber(record.image_height),
    detectionCount: asNumber(record.detection_count) ?? 0,
    decodeMs: asNumber(record.decode_ms),
    preprocessMs: asNumber(record.preprocess_ms),
    inferenceMs: asNumber(record.inference_ms),
    postprocessMs: asNumber(record.postprocess_ms),
    totalMs: asNumber(record.total_ms),
    detections,
    rawImageStatus: asString(record.raw_image_status),
    imageExists: Boolean(record.image_exists),
    createdAt: asString(record.created_at),
  };
}

export async function fetchCameraEvents(cameraId: string, limit = 20): Promise<CameraEventDetail[]> {
  const params = new URLSearchParams({ camera_id: cameraId, limit: String(limit) });
  const response = await fetch(`/api/events?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Events API returned ${response.status}`));
  }
  const payload = asRecord(await response.json());
  const rows = Array.isArray(payload.events) ? payload.events : [];
  return rows.map(normalizeCameraEvent);
}

export async function fetchCameraRetention(cameraId: string): Promise<CameraRetentionInfo | null> {
  const response = await fetch("/api/camera-retention", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Retention API returned ${response.status}`));
  }
  const payload = asRecord(await response.json());
  const rows = Array.isArray(payload.cameras) ? payload.cameras : [];
  const match = rows
    .map(asRecord)
    .find((row) => String(row.camera_id ?? "").toLowerCase() === cameraId.toLowerCase());
  if (!match) return null;

  return {
    cameraId: String(match.camera_id ?? cameraId),
    totalEvents: asNumber(match.total_events) ?? 0,
    withRaw: asNumber(match.with_raw) ?? 0,
    retainedRaw: asNumber(match.retained_raw) ?? 0,
    target: asNumber(match.target) ?? 0,
    remainingToTarget: asNumber(match.remaining_to_target) ?? 0,
    latestTs: asString(match.latest_ts),
  };
}
