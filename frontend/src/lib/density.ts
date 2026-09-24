export type DensityTier = "Clear" | "Low" | "Medium" | "High" | "Critical";

/**
 * Qualitative crowd tier from a raw live person count. The detection API
 * has no per-camera capacity/max-occupancy field, so there's no real "% of
 * capacity" to compute — these thresholds are a simple heuristic sized for
 * small indoor camera views (entrances, corridors, offices), not a
 * calibrated percentage.
 */
export function densityTierFromCount(count: number): DensityTier {
  if (count <= 0) return "Clear";
  if (count <= 2) return "Low";
  if (count <= 5) return "Medium";
  if (count <= 9) return "High";
  return "Critical";
}

export function densityTierColor(tier: DensityTier): string {
  switch (tier) {
    case "Critical":
      return "#ef4444";
    case "High":
      return "#f97316";
    case "Medium":
      return "#eab308";
    case "Low":
      return "#3b82f6";
    default:
      return "#64748b";
  }
}

export function densityTierBadgeTone(tier: DensityTier): "default" | "critical" | "high" | "positive" {
  switch (tier) {
    case "Critical":
      return "critical";
    case "High":
      return "high";
    case "Clear":
      return "positive";
    default:
      return "default";
  }
}
