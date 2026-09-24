import type { AlertCategory, AlertMatchEvent, AlertRuleV2 } from "@/lib/types";

export interface AllAlertEventsFilters {
  cameraId?: string;
  dateFrom?: string;
  dateTo?: string;
}

const ALERT_CATEGORIES: AlertCategory[] = ["critical", "medium", "low"];

function asCategory(value: unknown): AlertCategory {
  return ALERT_CATEGORIES.includes(value as AlertCategory) ? (value as AlertCategory) : "medium";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function fetchAllAlertEvents(
  filters: AllAlertEventsFilters = {}
): Promise<AlertMatchEvent[]> {
  const params = new URLSearchParams({ limit: "50" });
  if (filters.cameraId) params.set("camera_id", filters.cameraId);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);

  const response = await fetch("/api/alert-events?" + params.toString(), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Alert events API returned " + response.status);
  }
  const payload = asRecord(await response.json());
  const rows = Array.isArray(payload.events) ? payload.events : [];
  return rows.map((raw) => {
    const record = asRecord(raw);
    return {
      id: Number(record.id) || 0,
      alertId: String(record.alert_id ?? ""),
      eventId: String(record.event_id ?? ""),
      cameraId: String(record.camera_id ?? ""),
      detectionTs: asString(record.detection_ts),
      personCountInside: asNumber(record.person_count_inside) ?? 0,
      personCountOutside: asNumber(record.person_count_outside) ?? 0,
      classCountsInside: {},
      classCountsOutside: {},
      boundingBox: null,
      note: asString(record.note),
      seen: Boolean(record.seen),
      isLatest: Boolean(record.is_latest),
      createdAt: asString(record.created_at),
      ruleName: (record.rule_name as string) || undefined,
      ruleLabel: (record.rule_label as string) || undefined,
      category: asCategory(record.category),
      classNames: Array.isArray(record.class_names)
        ? record.class_names.map(String)
        : ["person"],
    };
  });
}

export async function updateAlertRuleDetails(
  alertId: string,
  payload: { name?: string; status?: string; category?: AlertCategory }
): Promise<AlertRuleV2> {
  const response = await fetch("/api/alerts/" + encodeURIComponent(alertId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Failed to update alert rule: " + response.status);
  }
  return await response.json();
}
