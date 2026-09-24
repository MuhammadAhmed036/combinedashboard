import { create } from "zustand";

/**
 * Live absence-tracking data per absence rule (frame-wide or zone-scoped),
 * written by `useNoPersonWatcher` as detection data arrives and read by
 * `AbsenceLiveStatus` to render a continuously-ticking "no person detected
 * for Xm" status. Deliberately NOT persisted — like the watcher's own
 * in-memory state, a reload has no evidence to restore and should just
 * re-arm from "now" rather than resurrecting a stale timestamp. (The
 * watcher separately reconstructs `lastPersonAtByRule`/
 * `lastResolvedDurationSecondsByRule` from the rule's own server-side match
 * history on cold start, so an accurate absence duration survives a reload
 * even though this store itself doesn't.)
 */
interface AlertPresenceState {
  lastPersonAtByRule: Record<string, number>;
  /** Duration (seconds) of the most recently *completed* absence episode per rule — shown once presence returns. */
  lastResolvedDurationSecondsByRule: Record<string, number>;
  setLastPersonAt: (alertId: string, atMs: number) => void;
  setLastResolvedDuration: (alertId: string, seconds: number) => void;
  clearRule: (alertId: string) => void;
}

export const useAlertPresenceStore = create<AlertPresenceState>((set) => ({
  lastPersonAtByRule: {},
  lastResolvedDurationSecondsByRule: {},
  setLastPersonAt: (alertId, atMs) =>
    set((state) => ({ lastPersonAtByRule: { ...state.lastPersonAtByRule, [alertId]: atMs } })),
  setLastResolvedDuration: (alertId, seconds) =>
    set((state) => ({
      lastResolvedDurationSecondsByRule: {
        ...state.lastResolvedDurationSecondsByRule,
        [alertId]: seconds,
      },
    })),
  clearRule: (alertId) =>
    set((state) => {
      const nextLastPersonAt = { ...state.lastPersonAtByRule };
      delete nextLastPersonAt[alertId];
      const nextResolved = { ...state.lastResolvedDurationSecondsByRule };
      delete nextResolved[alertId];
      return {
        lastPersonAtByRule: nextLastPersonAt,
        lastResolvedDurationSecondsByRule: nextResolved,
      };
    }),
}));
