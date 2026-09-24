import { useQuery } from "@tanstack/react-query";
import {
  fetchClassDensityLastHour,
  fetchClassTrendSeries,
  fetchDashboardStats,
  fetchLiveClassCounts,
  fetchLiveClassCountsByCamera,
  fetchTrend,
  type TrendKey,
} from "@/lib/services/statsService";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchDashboardStats,
    refetchInterval: 30_000,
  });
}

/** Live per-class object counts summed across all cameras, e.g. `{person: 3, car: 12}`. */
export function useLiveClassCounts() {
  return useQuery({
    queryKey: ["live-class-counts"],
    queryFn: fetchLiveClassCounts,
    refetchInterval: 5_000,
  });
}

export function useTrend(key: TrendKey) {
  return useQuery({ queryKey: ["trend", key], queryFn: () => fetchTrend(key) });
}

/** Live per-class object counts, one entry per camera. */
export function useLiveClassCountsByCamera() {
  return useQuery({
    queryKey: ["live-class-counts-by-camera"],
    queryFn: fetchLiveClassCountsByCamera,
    refetchInterval: 5_000,
  });
}

/** Peak per-class count each camera reached in the last hour. */
export function useClassDensityLastHour() {
  return useQuery({
    queryKey: ["class-density-last-hour"],
    queryFn: fetchClassDensityLastHour,
    refetchInterval: 60_000,
  });
}

const CLASS_TREND_WINDOW_HOURS = 2;

/** Fleet-wide multi-class time series over the last 2 hours. */
export function useClassTrendSeries() {
  return useQuery({
    queryKey: ["class-trend-series"],
    queryFn: () => {
      const toTs = new Date();
      const fromTs = new Date(toTs.getTime() - CLASS_TREND_WINDOW_HOURS * 3_600_000);
      return fetchClassTrendSeries({ fromTs: fromTs.toISOString(), toTs: toTs.toISOString(), bucketSeconds: 300 });
    },
    refetchInterval: 30_000,
  });
}
