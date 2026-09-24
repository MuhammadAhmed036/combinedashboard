"use client";

import { useMemo } from "react";
import { Activity, Users } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCameraLiveFeed } from "@/lib/hooks/useCameraLiveFeed";
import { useCameraPeopleCountSeries } from "@/lib/hooks/useCameraLocations";
import { Skeleton } from "@/components/ui/skeleton";
import { densityTierBadgeTone, densityTierFromCount } from "@/lib/density";
import { formatDateTime, formatTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<string, string> = {
  default: "bg-surface-3 text-muted-foreground",
  critical: "bg-severity-critical/15 text-severity-critical",
  high: "bg-severity-high/15 text-severity-high",
  positive: "bg-status-active/15 text-status-active",
};

function OccupancyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const count = payload[0].value;
  return (
    <div className="rounded-lg border border-surface-border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
      <div className="font-medium text-foreground">
        {count} {count === 1 ? "person" : "people"}
      </div>
      {label ? <div className="text-muted-foreground">{formatDateTime(String(label))}</div> : null}
    </div>
  );
}

export function CameraLiveStatsPanel({ cameraId }: { cameraId: string }) {
  const feed = useCameraLiveFeed(cameraId);
  const { data: series, isLoading: seriesLoading } = useCameraPeopleCountSeries(cameraId);

  const chartData = useMemo(
    () => series?.map((p) => ({ time: p.time, people: p.peopleCount })),
    [series]
  );

  const tier = densityTierFromCount(feed.peopleCount ?? 0);

  return (
    <div className="rounded-xl border border-surface-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Activity className="size-4" /> Live Occupancy
        </h3>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className={cn("size-1.5 rounded-full", feed.connected ? "animate-pulse bg-red-500" : "bg-gray-400")}
          />
          {feed.connected ? "Live" : "Connecting…"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-surface-border bg-surface-1 p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Users className="size-3.5" /> Current Persons
          </div>
          <div className="mt-1 text-xl font-semibold">{feed.peopleCount ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-1 p-2.5">
          <div className="text-[11px] text-muted-foreground">Density</div>
          <span
            className={cn(
              "mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
              TONE_CLASS[densityTierBadgeTone(tier)]
            )}
          >
            {tier}
          </span>
        </div>
      </div>

      <div className="mt-2.5 text-[11px] text-muted-foreground">
        Last detection: {feed.lastDetectionTime ? formatTime(feed.lastDetectionTime) : "—"}
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          <span>People Over Time · Last 2 Hours</span>
          <span>5-min intervals</span>
        </div>
        {seriesLoading ? (
          <Skeleton className="h-[150px] w-full" />
        ) : chartData && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="camera-occupancy-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={(value) => formatTime(String(value))}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                width={34}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<OccupancyTooltip />} cursor={{ stroke: "var(--surface-border)" }} />
              <Area
                type="monotone"
                dataKey="people"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#camera-occupancy-fill)"
                dot={false}
                activeDot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">No history in this window.</p>
        )}
      </div>

      {feed.error && <p className="mt-2 text-xs text-destructive">{feed.error}</p>}
    </div>
  );
}
