import type { AlertRuleV2 } from "@/lib/types";

/**
 * "New matches since this rule was last acknowledged." Resolved rules
 * never contribute (the user is done with them); everything else is the
 * rule's current `unseen_count` minus whatever it was the last time the
 * rule was marked seen, floored at 0.
 */
export function effectiveUnseenCount(rule: AlertRuleV2, baseline: number): number {
  if (rule.status === "resolved") return 0;
  return Math.max(0, rule.unseenCount - baseline);
}
