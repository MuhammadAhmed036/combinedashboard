"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Users } from "lucide-react";
import { useAlertPresenceStore } from "@/lib/store/useAlertPresenceStore";
import {
  ABSENCE_PRESENCE_GRACE_MS,
  absenceThresholdSeconds,
  formatAbsenceThreshold,
} from "@/lib/alertConditions";
import type { AlertRuleV2 } from "@/lib/types";
import { cn } from "@/lib/utils";

// Minute-level granularity is all the display needs ("2 minutes", "15
// minutes", "1 hour") — a faster tick would just waste re-renders.
const TICK_MS = 5_000;

/**
 * Live, continuously-updating status for a "No Person Detected" rule —
 * reads `useAlertPresenceStore` (written by `useNoPersonWatcher` as
 * detection data arrives) rather than the rule's own `updatedAt`/match
 * history, since those only change once per fire/repeat cadence, not
 * continuously. Ticks its own local clock so the elapsed time keeps moving
 * between watcher updates too.
 *
 * Shows the actual elapsed absence duration as soon as it's meaningful
 * (past the presence-grace window), not just once the alert threshold is
 * crossed — "no person for 2m" below threshold, escalating to a destructive
 * color once the rule has actually fired. Once presence returns, shows the
 * duration of the *previous* completed absence episode (if any) instead of
 * a generic "monitoring" message, so the exact elapsed absence time stays
 * visible rather than disappearing the moment someone walks back in.
 */
export function AbsenceLiveStatus({ rule, className }: { rule: AlertRuleV2; className?: string }) {
  const lastPersonAtMs = useAlertPresenceStore((s) => s.lastPersonAtByRule[rule.alertId]);
  const lastResolvedSeconds = useAlertPresenceStore(
    (s) => s.lastResolvedDurationSecondsByRule[rule.alertId]
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  if (lastPersonAtMs === undefined) {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Users className="size-3.5" /> Waiting for live data…
      </div>
    );
  }

  const thresholdMs = absenceThresholdSeconds(rule) * 1000;
  const elapsedMs = Math.max(0, now - lastPersonAtMs);

  if (elapsedMs < ABSENCE_PRESENCE_GRACE_MS) {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs font-medium text-status-active", className)}>
        <Users className="size-3.5" />
        {lastResolvedSeconds !== undefined
          ? `Person present — was absent for ${formatAbsenceThreshold(lastResolvedSeconds)}`
          : "Person present — monitoring"}
      </div>
    );
  }

  const alerting = elapsedMs >= thresholdMs;
  const duration = formatAbsenceThreshold(Math.round(elapsedMs / 1000));

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium",
        alerting ? "text-destructive" : "text-severity-medium",
        className
      )}
    >
      {alerting ? <AlertTriangle className="size-3.5" /> : <Clock className="size-3.5" />}
      {alerting ? `No person detected for ${duration}` : `No person detected for ${duration} (not yet alerting)`}
    </div>
  );
}
