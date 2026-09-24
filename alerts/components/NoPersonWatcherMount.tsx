"use client";

import { useNoPersonWatcher } from "@/lib/hooks/useNoPersonWatcher";

/** Mounts the browser-side no-person live-status tracker; backend sync owns alert generation. */
export function NoPersonWatcherMount() {
  useNoPersonWatcher();
  return null;
}
