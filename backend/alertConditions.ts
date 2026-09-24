import type { AlertMatchEvent, AlertRuleV2 } from "@/lib/types";
import { formatClassCounts, formatClassNames } from "@/lib/detectionClasses";

/** Discriminator stored in `conditions.condition` for no-person rules. */
export const ABSENCE_CONDITION = "absence";

/** Fallback threshold for a rule that somehow lost its value — should not happen in practice. */
export const DEFAULT_ABSENCE_THRESHOLD_SECONDS = 300;

/** Shortest threshold the UI offers. A 1-minute rule repeats hourly at up to 60 match events/hour while empty — acceptable, but noticeably chattier than the longer presets. */
export const MIN_ABSENCE_THRESHOLD_SECONDS = 60;

export const ABSENCE_THRESHOLD_OPTIONS = [60, 300, 600, 900, 1800, 3600] as const;

/**
 * The frame-wide feed only re-confirms presence roughly once per detection
 * bucket (~1m), so a person continuously in view can still show a small
 * nonzero elapsed time between messages. Below this grace window, treat it
 * as "still present" noise rather than a real, reportable gap. Shared by
 * `AbsenceLiveStatus` (live status line) and `AbsenceDailyTotal` (today's
 * running total), so both agree on what counts as "actually absent."
 */
export const ABSENCE_PRESENCE_GRACE_MS = 90_000;

export function isAbsenceRule(rule: Pick<AlertRuleV2, "conditions">): boolean {
  return rule.conditions?.condition === ABSENCE_CONDITION;
}

/**
 * An absence rule with a drawn region ("Restricted Zone") only counts a
 * person seen *inside that box* as presence — the rest of the frame doesn't
 * matter. An absence rule with no box (the original, simpler flow) treats
 * any person anywhere in the frame as presence.
 */
export function isZoneScopedAbsenceRule(
  rule: Pick<AlertRuleV2, "conditions" | "boundingBox" | "refImageWidth" | "refImageHeight">
): boolean {
  return (
    isAbsenceRule(rule) &&
    Boolean(rule.boundingBox && rule.refImageWidth && rule.refImageHeight)
  );
}

export function absenceThresholdSeconds(rule: Pick<AlertRuleV2, "conditions">): number {
  return rule.conditions?.absenceThresholdSeconds ?? DEFAULT_ABSENCE_THRESHOLD_SECONDS;
}

/** "5m", "1h", "1h 30m" — `formatDuration` in formatters.ts is mm:ss and unsuitable here. */
export function formatAbsenceThreshold(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/**
 * `AlertMatchEvent.personCountInside`/`personCountOutside` are meaningless
 * for absence rules in their original sense (there's no detected person to
 * count) — the no-person watcher instead reuses them as a small structured
 * encoding, the same trick already used for smuggling `category`/
 * `ref_image_*` through the rule's `metadata` bag:
 *
 *  - A "still absent" fire event: `personCountInside: 0`, `personCountOutside`
 *    = elapsed absence seconds at the moment it fired.
 *  - A "person returned" resolve event: `personCountInside: 1`,
 *    `personCountOutside` = total seconds the zone/camera was unoccupied.
 *
 * This lets a reload reconstruct exactly how long an absence has been
 * running (or how long the last one lasted) from the rule's own persisted
 * history, instead of relying on in-memory state that a reload wipes.
 */
export function isAbsenceResolvedEvent(match: Pick<AlertMatchEvent, "personCountInside">): boolean {
  return match.personCountInside === 1;
}

export function absenceEventDurationSeconds(match: Pick<AlertMatchEvent, "personCountOutside">): number {
  return Math.max(0, match.personCountOutside);
}

/**
 * Per-class breakdown for one match-history row, e.g. "2 person, 5 car
 * inside". Falls back to the plain inside/outside counts for matches
 * recorded before the per-class breakdown was tracked.
 */
export function describeMatchCounts(match: AlertMatchEvent): string {
  const inside = formatClassCounts(match.classCountsInside);
  const outside = formatClassCounts(match.classCountsOutside);
  if (!inside && !outside) {
    return `${match.personCountInside} inside · ${match.personCountOutside} outside`;
  }
  const parts: string[] = [];
  if (inside) parts.push(`${inside} inside`);
  if (outside) parts.push(`${outside} outside`);
  return parts.join(" · ");
}

/**
 * Single source of truth for the small grey sub-title under a rule's name —
 * previously duplicated inline in AlertRulesTable and AlertRuleDetailPanel.
 */
export function describeAlertCondition(rule: AlertRuleV2): string {
  if (isAbsenceRule(rule)) {
    const scope = isZoneScopedAbsenceRule(rule) ? "no person in zone" : "no person";
    return `${scope} · ${formatAbsenceThreshold(absenceThresholdSeconds(rule))}+`;
  }
  return `${formatClassNames(rule.classNames)} · ${rule.conditions?.triggerInside ? "enters zone" : "outside zone"}`;
}
