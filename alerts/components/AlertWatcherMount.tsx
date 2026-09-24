"use client";

import { useAlertWatcher } from "@/lib/hooks/useAlertWatcher";

/** Compatibility mount; the hook is a no-op because backend sync owns alert generation. */
export function AlertWatcherMount() {
  useAlertWatcher();
  return null;
}
