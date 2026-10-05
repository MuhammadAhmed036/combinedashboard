import type { AlertCategory, AlertMatchEvent, Camera } from "@/lib/types";
import { resolveDetectionCameraId } from "@/lib/streamToDetectionCameraId";

export interface ActiveCameraAlert {
  hasAlert: boolean;
  category: AlertCategory;
  ruleName?: string;
  count: number;
  lastEventTs?: string;
  eventId?: string;
  alertId?: string;
}

/** Active window in milliseconds: 3 minutes (180,000 ms). */
export const ALERT_ACTIVE_WINDOW_MS = 180_000;
/** Extended window for unacknowledged (seen=false) events: 10 minutes. */
export const ALERT_UNSEEN_WINDOW_MS = 600_000;

export function normalizeAlertCategory(cat: unknown): AlertCategory {
  const s = String(cat || "").toLowerCase().trim();
  if (s === "critical" || s === "high" || s === "danger") return "critical";
  if (s === "low" || s === "info") return "low";
  return "medium";
}

const CATEGORY_SEVERITY_WEIGHT: Record<AlertCategory, number> = {
  critical: 3,
  medium: 2,
  low: 1,
};

export function getCameraLookupKeys(camera: Camera): string[] {
  return [
    camera.id,
    camera.code,
    camera.name,
    camera.sourceName,
    resolveDetectionCameraId(camera.id),
    resolveDetectionCameraId(camera.code ?? camera.id),
    resolveDetectionCameraId(camera.name ?? camera.id),
  ]
    .filter(Boolean)
    .map((k) => String(k).toLowerCase().trim());
}

/**
 * Builds a fast lookup map of active alerts indexed by normalized camera key.
 * Prioritizes higher severity categories (critical > medium > low).
 */
export function buildCameraAlertLookup(
  events: AlertMatchEvent[] | undefined,
  activeWindowMs: number = ALERT_ACTIVE_WINDOW_MS,
  unseenWindowMs: number = ALERT_UNSEEN_WINDOW_MS
): Map<string, ActiveCameraAlert> {
  const map = new Map<string, ActiveCameraAlert>();
  if (!events || !Array.isArray(events) || events.length === 0) return map;

  const now = Date.now();

  for (const event of events) {
    if (!event.cameraId) continue;

    const rawTs = event.detectionTs || event.createdAt;
    if (!rawTs) continue;
    const eventTime = new Date(rawTs).getTime();
    if (Number.isNaN(eventTime)) continue;

    const age = now - eventTime;
    // Allow small clock drift (-30s)
    const isRecent = age <= activeWindowMs && age >= -30_000;
    const isUnseenRecent = !event.seen && age <= unseenWindowMs && age >= -30_000;

    if (!isRecent && !isUnseenRecent) continue;

    const normalizedCat = normalizeAlertCategory(event.category);
    const weight = CATEGORY_SEVERITY_WEIGHT[normalizedCat];

    const keys = [
      event.cameraId,
      resolveDetectionCameraId(event.cameraId),
    ]
      .filter(Boolean)
      .map((k) => String(k).toLowerCase().trim());

    for (const key of keys) {
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          hasAlert: true,
          category: normalizedCat,
          ruleName: event.ruleName || event.ruleLabel || event.alertId,
          count: 1,
          lastEventTs: rawTs,
          eventId: event.eventId,
          alertId: event.alertId,
        });
      } else {
        existing.count += 1;
        const existingWeight = CATEGORY_SEVERITY_WEIGHT[existing.category];
        if (weight > existingWeight) {
          existing.category = normalizedCat;
          existing.ruleName = event.ruleName || event.ruleLabel || event.alertId;
        }
      }
    }
  }

  return map;
}

export function findCameraActiveAlert(
  camera: Camera,
  lookup: Map<string, ActiveCameraAlert>
): ActiveCameraAlert | null {
  for (const key of getCameraLookupKeys(camera)) {
    const alert = lookup.get(key);
    if (alert) return alert;
  }
  return null;
}
