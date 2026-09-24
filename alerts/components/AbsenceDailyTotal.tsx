"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useAlertHistory } from "@/lib/hooks/useAlertRules";
import { useAlertPresenceStore } from "@/lib/store/useAlertPresenceStore";
import {
  ABSENCE_PRESENCE_GRACE_MS,
  absenceEventDurationSeconds,
  formatAbsenceThreshold,
  isAbsenceResolvedEvent,
} from "@/lib/alertConditions";
import type { AlertRuleV2 } from "@/lib/types";
import { cn } from "@/lib/utils";

// A running daily total doesn't need second-level refresh like the live
// status ticker does — this just needs to keep climbing smoothly while an
// absence is ongoing.
const TICK_MS = 15_000;

function startOfToday(): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Total time a rule's zone/camera has been unoccupied so far TODAY (local
 * calendar day) — e.g. absent 10:00–10:05, then again 10:25–10:35, reads
 * "Absent Today: 15m". Sums every completed ("resolved") episode from the
 * rule's own match history whose end time falls today, clipped to the
 * portion actually within today for any episode that started yesterday,
 * plus the today-portion of any absence still in progress right now.
 *
 * Distinct from `AbsenceLiveStatus`, which only shows "how long since the
 * last person was seen" for the CURRENT gap — this adds up every separate
 * gap across the whole day.
 */
export function AbsenceDailyTotal({ rule, className }: { rule: AlertRuleV2; className?: string }) {
  const { data: history } = useAlertHistory(rule.alertId);
  const lastPersonAtMs = useAlertPresenceStore((s) => s.lastPersonAtByRule[rule.alertId]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const totalSeconds = useMemo(() => {
    const todayStartMs = startOfToday();
    let total = 0;

    for (const match of history ?? []) {
      if (!isAbsenceResolvedEvent(match)) continue;
      const resolvedAtMs = Date.parse(match.detectionTs ?? match.createdAt ?? "");
      if (!Number.isFinite(resolvedAtMs) || resolvedAtMs < todayStartMs) continue;
      // Clip to today's portion in case the episode started yesterday —
      // the stored duration is the episode's full length, not just today's share.
      const episodeStartMs = resolvedAtMs - absenceEventDurationSeconds(match) * 1000;
      const countedStartMs = Math.max(episodeStartMs, todayStartMs);
      total += Math.max(0, Math.round((resolvedAtMs - countedStartMs) / 1000));
    }

    // Add the today-portion of a still-ongoing absence, if there is one.
    if (lastPersonAtMs !== undefined && now - lastPersonAtMs >= ABSENCE_PRESENCE_GRACE_MS) {
      const countedStartMs = Math.max(lastPersonAtMs, todayStartMs);
      total += Math.max(0, Math.round((now - countedStartMs) / 1000));
    }

    return total;
  }, [history, lastPersonAtMs, now]);

  return (
    <div className={cn("flex items-center justify-between", className)}>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <CalendarClock className="size-3.5" /> Absent Today
      </span>
      <span className="font-medium">
        {totalSeconds > 0 ? formatAbsenceThreshold(totalSeconds) : "—"}
      </span>
    </div>
  );
}
