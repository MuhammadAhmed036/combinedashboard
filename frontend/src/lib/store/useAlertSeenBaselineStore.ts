import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Remembers each alert rule's `unseen_count` value at the moment it was
 * last acknowledged. The backend's `unseen_count` field is a running
 * total that's never reset by `/seen` — it only bumps forward with every
 * new match. To get "new matches since I last checked" per rule, we track
 * that baseline here and diff against the current count.
 */
interface AlertSeenBaselineState {
  baselines: Record<string, number>;
  setBaseline: (alertId: string, unseenCountAtAck: number) => void;
  clearBaseline: (alertId: string) => void;
}

export const useAlertSeenBaselineStore = create<AlertSeenBaselineState>()(
  persist(
    (set) => ({
      baselines: {},
      setBaseline: (alertId, unseenCountAtAck) =>
        set((state) => ({ baselines: { ...state.baselines, [alertId]: unseenCountAtAck } })),
      clearBaseline: (alertId) =>
        set((state) => ({ baselines: { ...state.baselines, [alertId]: 0 } })),
    }),
    { name: "safecity-alert-seen-baselines" }
  )
);
