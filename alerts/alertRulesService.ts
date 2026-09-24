import type {
  AlertBoundingBox,
  AlertCategory,
  AlertConditions,
  AlertMatchEvent,
  AlertRuleV2,
  AlertStatsSummary,
} from "@/lib/types";

const ALERT_CATEGORIES: AlertCategory[] = ["critical", "medium", "low"];

function asCategory(value: unknown): AlertCategory {
  return ALERT_CATEGORIES.includes(value as AlertCategory) ? (value as AlertCategory) : "medium";
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Like `asNumber`, but rejects 0/negative — `Number(null/undefined)` is 0, which would silently give an absence rule a 0-second threshold. */
function asPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeBoundingBox(value: unknown): AlertBoundingBox | null {
  const record = asRecord(value);
  const x1 = asNumber(record.x1);
  const y1 = asNumber(record.y1);
  const x2 = asNumber(record.x2);
  const y2 = asNumber(record.y2);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
  return { x1, y1, x2, y2, region: asString(record.region) ?? undefined };
}

function normalizeConditions(value: unknown, metadata: UnknownRecord): AlertConditions | null {
  const record = asRecord(value);
  if (!("condition" in record)) return null;
  return {
    condition: String(record.condition ?? "boundary"),
    triggerInside: Boolean(record.trigger_inside),
    triggerOutside: Boolean(record.trigger_outside),
    personLabel: String(record.person_label ?? "person"),
    // Prefer the value on `conditions` itself; fall back to `metadata` in
    // case the backend ever strips unknown keys from `conditions`.
    absenceThresholdSeconds:
      asPositiveNumber(record.absence_threshold_seconds) ??
      asPositiveNumber(metadata.absence_threshold_seconds),
  };
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  const detail = asRecord(body).detail ?? asRecord(body).error;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const message = asRecord(detail).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

function normalizeAlertRule(raw: unknown): AlertRuleV2 {
  const record = asRecord(raw);
  const metadata = asRecord(record.metadata);
  const conditionsRecord = asRecord(record.conditions);
  const rawClassNames = Array.isArray(conditionsRecord.class_names)
    ? conditionsRecord.class_names.map(String)
    : [];

  return {
    id: Number(record.id) || 0,
    alertId: String(record.alert_id ?? ""),
    cameraId: String(record.camera_id ?? ""),
    zone: asString(record.zone),
    collectionId: asString(record.collection_id),
    collectionName: asString(record.collection_name),
    label: asString(record.label),
    name: asString(record.name),
    description: asString(record.description),
    sourceEventId: asString(record.source_event_id),
    boundingBox: normalizeBoundingBox(record.bounding_box),
    conditions: normalizeConditions(record.conditions, metadata),
    classNames: rawClassNames.length ? rawClassNames : ["person"],
    category: asCategory(metadata.category),
    refImageWidth: asNumber(metadata.ref_image_width),
    refImageHeight: asNumber(metadata.ref_image_height),
    personCountInside: asNumber(record.person_count_inside) ?? 0,
    personCountOutside: asNumber(record.person_count_outside) ?? 0,
    seenCount: asNumber(record.seen_count) ?? 0,
    unseenCount: asNumber(record.unseen_count) ?? 0,
    seen: Boolean(record.seen),
    seenBy: Array.isArray(record.seen_by) ? record.seen_by.map(String) : [],
    seenAt: asString(record.seen_at),
    status: (asString(record.status) as AlertRuleV2["status"]) ?? "active",
    latestEventId: asString(record.latest_event_id),
    createdBy: asString(record.created_by),
    createdAt: asString(record.created_at),
    updatedAt: asString(record.updated_at),
    eventCount: asNumber(record.event_count) ?? 0,
  };
}

function normalizeClassCounts(value: unknown): Record<string, number> {
  const record = asRecord(value);
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(record)) {
    const n = Number(count);
    if (Number.isFinite(n)) counts[key] = n;
  }
  return counts;
}

function normalizeMatchEvent(raw: unknown): AlertMatchEvent {
  const record = asRecord(raw);
  const detectionsJson = asRecord(record.detections_json);
  return {
    id: Number(record.id) || 0,
    alertId: String(record.alert_id ?? ""),
    eventId: String(record.event_id ?? ""),
    cameraId: String(record.camera_id ?? ""),
    detectionTs: asString(record.detection_ts),
    personCountInside: asNumber(record.person_count_inside) ?? 0,
    personCountOutside: asNumber(record.person_count_outside) ?? 0,
    classCountsInside: normalizeClassCounts(detectionsJson.inside),
    classCountsOutside: normalizeClassCounts(detectionsJson.outside),
    boundingBox: normalizeBoundingBox(record.bounding_box),
    note: asString(record.note),
    seen: Boolean(record.seen),
    isLatest: Boolean(record.is_latest),
    createdAt: asString(record.created_at),
  };
}

export interface AlertRuleFilters {
  status?: string;
  cameraId?: string;
  zone?: string;
  seen?: boolean;
  q?: string;
}

export async function fetchAlertRules(filters: AlertRuleFilters = {}): Promise<AlertRuleV2[]> {
  const params = new URLSearchParams({ limit: "200" });
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.cameraId) params.set("camera_id", filters.cameraId);
  if (filters.zone) params.set("zone", filters.zone);
  if (filters.seen !== undefined) params.set("seen", String(filters.seen));
  if (filters.q) params.set("q", filters.q);

  const response = await fetch(`/api/alerts?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Alerts API returned ${response.status}`));
  }
  const payload = asRecord(await response.json());
  const rows = Array.isArray(payload.alerts) ? payload.alerts : [];
  return rows.map(normalizeAlertRule);
}

export async function fetchAlertStats(): Promise<AlertStatsSummary> {
  const response = await fetch("/api/alerts/stats", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Alert stats API returned ${response.status}`));
  }
  const payload = asRecord(await response.json());
  const byStatus = asRecord(payload.by_status);
  return {
    total: asNumber(payload.total) ?? 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, Number(v) || 0])),
    seen: asNumber(payload.seen) ?? 0,
    unseen: asNumber(payload.unseen) ?? 0,
  };
}

export async function fetchAlertRule(alertId: string): Promise<AlertRuleV2> {
  const response = await fetch(`/api/alerts/${encodeURIComponent(alertId)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Alert API returned ${response.status}`));
  }
  return normalizeAlertRule(await response.json());
}

export async function fetchAlertHistory(alertId: string): Promise<AlertMatchEvent[]> {
  const response = await fetch(
    `/api/alerts/${encodeURIComponent(alertId)}/events?limit=100`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Alert history API returned ${response.status}`));
  }
  const payload = asRecord(await response.json());
  const rows = Array.isArray(payload.events) ? payload.events : [];
  return rows.map(normalizeMatchEvent);
}

export interface AbsenceEvent {
  id: number;
  alertId: string;
  cameraId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  snapshotEventId: string | null;
  snapshotPath: string | null;
  createdAt: string;
}

export interface AbsenceSummary {
  absentSeconds: number;
  absenceEvents: number;
}

function normalizeAbsenceEvent(raw: unknown): AbsenceEvent {
  const row = asRecord(raw);
  return {
    id: Number(row.id) || 0,
    alertId: String(row.alert_id ?? ""),
    cameraId: String(row.camera_id ?? ""),
    startedAt: String(row.started_at ?? ""),
    endedAt: asString(row.ended_at),
    durationSeconds: asNumber(row.duration_seconds),
    snapshotEventId: asString(row.snapshot_event_id),
    snapshotPath: asString(row.snapshot_path),
    createdAt: String(row.created_at ?? ""),
  };
}

export async function fetchAbsenceEvents(alertId: string): Promise<{ events: AbsenceEvent[]; summary: AbsenceSummary }> {
  const response = await fetch(`/api/alerts/${encodeURIComponent(alertId)}/absence-events?limit=100`, { cache: "no-store" });
  if (!response.ok) throw new Error(await parseErrorMessage(response, `Absence history API returned ${response.status}`));
  const payload = asRecord(await response.json());
  const summary = asRecord(payload.summary);
  return {
    events: Array.isArray(payload.events) ? payload.events.map(normalizeAbsenceEvent) : [],
    summary: {
      absentSeconds: Number(summary.absent_seconds) || 0,
      absenceEvents: Number(summary.absence_events) || 0,
    },
  };
}

interface CreateAlertRuleBase {
  cameraId: string;
  zone?: string;
  name: string;
  label: string;
  category: AlertCategory;
  description?: string;
  createdBy?: string;
}

export interface CreateRegionAlertRulePayload extends CreateAlertRuleBase {
  kind?: "region";
  sourceEventId?: string;
  boundingBox: AlertBoundingBox;
  triggerInside: boolean;
  triggerOutside: boolean;
  refImageWidth: number;
  refImageHeight: number;
  /** Which raw detection classes this rule watches for — e.g. `["person", "car"]`. Dynamic, not a fixed enum. */
  classNames: string[];
}

export interface CreateAbsenceAlertRulePayload extends CreateAlertRuleBase {
  kind: "absence";
  absenceThresholdSeconds: number;
  /**
   * Optional "Restricted Zone" — when set, only a person detected inside
   * this region counts as presence; the rest of the frame is ignored. Omit
   * for the simpler frame-wide flow (any person anywhere resets the timer).
   */
  sourceEventId?: string;
  boundingBox?: AlertBoundingBox;
  refImageWidth?: number;
  refImageHeight?: number;
}

export type CreateAlertRulePayload = CreateRegionAlertRulePayload | CreateAbsenceAlertRulePayload;

export async function createAlertRule(payload: CreateAlertRulePayload): Promise<AlertRuleV2> {
  const base = {
    camera_id: payload.cameraId,
    zone: payload.zone,
    name: payload.name,
    label: payload.label,
    description: payload.description,
    status: "active",
    created_by: payload.createdBy ?? "dashboard",
  };

  const body =
    payload.kind === "absence"
      ? {
          ...base,
          // Bounding box is optional — present only for a "Restricted Zone"
          // rule; omitted entirely for the frame-wide flow.
          source_event_id: payload.sourceEventId,
          bounding_box: payload.boundingBox,
          conditions: {
            condition: "absence",
            trigger_inside: false,
            trigger_outside: false,
            person_label: payload.label,
            absence_threshold_seconds: payload.absenceThresholdSeconds,
          },
          metadata: {
            category: payload.category,
            // Mirrored: `metadata` is the backend JSON bag already proven to
            // accept arbitrary keys (category/ref_image_* live here too);
            // the reader prefers `conditions` and falls back to this.
            absence_threshold_seconds: payload.absenceThresholdSeconds,
            ...(payload.boundingBox
              ? { ref_image_width: payload.refImageWidth, ref_image_height: payload.refImageHeight }
              : {}),
          },
        }
      : {
          ...base,
          source_event_id: payload.sourceEventId,
          bounding_box: payload.boundingBox,
          conditions: {
            condition: "boundary",
            trigger_inside: payload.triggerInside,
            trigger_outside: payload.triggerOutside,
            person_label: payload.label,
            class_names: payload.classNames,
          },
          metadata: {
            category: payload.category,
            ref_image_width: payload.refImageWidth,
            ref_image_height: payload.refImageHeight,
          },
        };

  const response = await fetch("/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Failed to create alert rule (${response.status})`));
  }
  return normalizeAlertRule(await response.json());
}

export async function updateAlertRuleStatus(
  alertId: string,
  status: string
): Promise<AlertRuleV2> {
  const response = await fetch(`/api/alerts/${encodeURIComponent(alertId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Failed to update alert rule (${response.status})`));
  }
  return normalizeAlertRule(await response.json());
}

export async function deleteAlertRule(alertId: string): Promise<void> {
  const response = await fetch(`/api/alerts/${encodeURIComponent(alertId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Failed to delete alert rule (${response.status})`));
  }
}

export async function markAlertSeen(
  alertId: string,
  options: { user?: string; seen?: boolean } = {}
): Promise<AlertRuleV2> {
  const response = await fetch(`/api/alerts/${encodeURIComponent(alertId)}/seen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Failed to acknowledge alert (${response.status})`));
  }
  return normalizeAlertRule(await response.json());
}

export interface AppendAlertEventPayload {
  eventId: string;
  detectionTs?: string;
  personCountInside?: number;
  personCountOutside?: number;
  boundingBox?: AlertBoundingBox;
  /** Per-class breakdown of the matched boxes, e.g. `{inside: {person: 2, car: 5}, outside: {}}`. */
  classCounts?: { inside: Record<string, number>; outside: Record<string, number> };
  note?: string;
  createdBy?: string;
}

export async function appendAlertEvent(
  alertId: string,
  payload: AppendAlertEventPayload
): Promise<void> {
  const response = await fetch(`/api/alerts/${encodeURIComponent(alertId)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_id: payload.eventId,
      detection_ts: payload.detectionTs,
      person_count_inside: payload.personCountInside,
      person_count_outside: payload.personCountOutside,
      bounding_box: payload.boundingBox,
      detections_json: payload.classCounts,
      note: payload.note,
      created_by: payload.createdBy ?? "dashboard",
    }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Failed to record alert match (${response.status})`));
  }
}
