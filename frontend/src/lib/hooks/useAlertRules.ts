import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AlertRuleFilters,
  type CreateAlertRulePayload,
  createAlertRule,
  deleteAlertRule,
  fetchAbsenceEvents,
  fetchAlertHistory,
  fetchAlertRule,
  fetchAlertRules,
  fetchAlertStats,
  markAlertSeen,
  updateAlertRuleStatus,
} from "@/lib/services/alertRulesService";
import {
  fetchAllAlertEvents,
  type AllAlertEventsFilters,
} from "@/lib/services/alertEventsService";
import { effectiveUnseenCount } from "@/lib/alertUnseen";
import { useAlertSeenBaselineStore } from "@/lib/store/useAlertSeenBaselineStore";

export function useAlertRules(filters: AlertRuleFilters = {}) {
  return useQuery({
    queryKey: ["alert-rules", filters],
    queryFn: () => fetchAlertRules(filters),
    refetchInterval: 10_000,
  });
}

export function useAlertStats() {
  return useQuery({
    queryKey: ["alert-rules", "stats"],
    queryFn: fetchAlertStats,
    refetchInterval: 10_000,
  });
}

/**
 * Sum of "new matches since last acknowledged" across all non-resolved
 * rules. Marking a rule seen resets its contribution to 0 immediately;
 * every match the watcher records after that counts up again from there,
 * so the badge keeps reflecting genuinely new activity instead of staying
 * silenced forever after the first acknowledgment. Resolving a rule is
 * what actually stops it from contributing.
 *
 * Not the same as `useAlertStats().unseen`, which counts *rules* whose
 * top-level `seen` flag is false (a one-time per-rule toggle) — that
 * number only moves when rules are created or acknowledged, not as new
 * matches come in, so it looks "stuck" for a notification badge.
 */
export function useUnseenAlertMatchCount() {
  const { data: rules } = useAlertRules();
  const baselines = useAlertSeenBaselineStore((s) => s.baselines);
  return (rules ?? []).reduce(
    (sum, rule) => sum + effectiveUnseenCount(rule, baselines[rule.alertId] ?? 0),
    0
  );
}

export function useAlertRule(alertId: string | null) {
  return useQuery({
    queryKey: ["alert-rules", "detail", alertId],
    queryFn: () => fetchAlertRule(alertId as string),
    enabled: Boolean(alertId),
    refetchInterval: 10_000,
  });
}

export function useAlertHistory(alertId: string | null) {
  return useQuery({
    queryKey: ["alert-rules", "history", alertId],
    queryFn: () => fetchAlertHistory(alertId as string),
    enabled: Boolean(alertId),
    refetchInterval: 10_000,
  });
}

/** Fetch all alert events across all rules, with optional camera/date filters. */
export function useAllAlertEvents(filters: AllAlertEventsFilters = {}) {
  return useQuery({
    queryKey: ["alert-events", "all", filters],
    queryFn: () => fetchAllAlertEvents(filters),
    refetchInterval: 10_000,
  });
}

export function useAbsenceEvents(alertId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["absence-events", alertId],
    queryFn: () => fetchAbsenceEvents(alertId as string),
    enabled: enabled && Boolean(alertId),
    refetchInterval: 10_000,
  });
}

function useInvalidateAlertRules() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
}

export function useCreateAlertRule() {
  const invalidate = useInvalidateAlertRules();
  return useMutation({
    mutationFn: (payload: CreateAlertRulePayload) => createAlertRule(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateAlertRuleStatus() {
  const invalidate = useInvalidateAlertRules();
  return useMutation({
    mutationFn: ({ alertId, status }: { alertId: string; status: string }) =>
      updateAlertRuleStatus(alertId, status),
    onSuccess: invalidate,
  });
}

export function useDeleteAlertRule() {
  const invalidate = useInvalidateAlertRules();
  return useMutation({
    mutationFn: (alertId: string) => deleteAlertRule(alertId),
    onSuccess: invalidate,
  });
}

export function useMarkAlertSeen() {
  const invalidate = useInvalidateAlertRules();
  const setBaseline = useAlertSeenBaselineStore((s) => s.setBaseline);
  const clearBaseline = useAlertSeenBaselineStore((s) => s.clearBaseline);
  return useMutation({
    mutationFn: ({ alertId, user, seen }: { alertId: string; user?: string; seen?: boolean }) =>
      markAlertSeen(alertId, { user, seen }),
    onSuccess: (updatedRule, variables) => {
      // Un-acknowledging (seen: false) means "show everything again"; marking
      // seen (the default) sets the baseline to the current unseen_count so
      // only matches recorded *after* this point count as new going forward.
      if (variables.seen === false) clearBaseline(variables.alertId);
      else setBaseline(variables.alertId, updatedRule.unseenCount);
      invalidate();
    },
  });
}
