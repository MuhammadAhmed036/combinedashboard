"use client";

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Bike, Bus, Car, Gauge, PackageSearch, Radio, Truck, Users, BellRing } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { ClassTrendChart } from "@/components/analytics/ClassTrendChart";
import { ClassDensityChart } from "@/components/analytics/ClassDensityChart";
import { AlertStatusChart } from "@/components/analytics/AlertStatusChart";
import { AlertCategoryBadge } from "@/components/alerts/AlertCategoryBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCameraLocations } from "@/lib/hooks/useCameraLocations";
import { useCameras } from "@/lib/hooks/useCameras";
import { useLiveCameraOccupancy } from "@/lib/hooks/useLiveCameraOccupancy";
import { useAlertRules, useAlertStats, useUnseenAlertMatchCount } from "@/lib/hooks/useAlertRules";
import {
  useClassDensityLastHour,
  useClassTrendSeries,
  useLiveClassCounts,
  useLiveClassCountsByCamera,
} from "@/lib/hooks/useDashboardStats";
import { useAlertSeenBaselineStore } from "@/lib/store/useAlertSeenBaselineStore";
import { effectiveUnseenCount } from "@/lib/alertUnseen";
import { densityTierFromCount } from "@/lib/density";
import { zoneColor } from "@/components/map/CameraLocationMap";
import { resolveDetectionCameraId } from "@/lib/streamToDetectionCameraId";
import { formatNumber } from "@/lib/formatters";

const CLASS_ICONS: Record<string, LucideIcon> = {
  person: Users,
  car: Car,
  truck: Truck,
  bus: Bus,
  motorcycle: Bike,
  bicycle: Bike,
};

function classIcon(className: string): LucideIcon {
  return CLASS_ICONS[className] ?? PackageSearch;
}

function classLabel(className: string): string {
  return className.charAt(0).toUpperCase() + className.slice(1);
}

export default function AnalyticsPage() {
  const { data: registryCameras } = useCameraLocations();
  // Same live-stream feed used on Map View/Dashboard to drop stale rows —
  // the registry only ever gains rows, never loses one when a camera is
  // decommissioned, so without this filter the "Last Hour" chart below pads
  // itself out with dozens of long-dead cameras that can only ever report 0.
  const { data: streamCameras } = useCameras();
  const liveOccupancy = useLiveCameraOccupancy();
  const { data: alertStats } = useAlertStats();
  const { data: rules } = useAlertRules();
  const unseenMatchCount = useUnseenAlertMatchCount();
  const baselines = useAlertSeenBaselineStore((s) => s.baselines);
  const { data: liveClassCounts } = useLiveClassCounts();

  const liveClassEntries = useMemo(
    () => Object.entries(liveClassCounts ?? {}).sort(([, a], [, b]) => b - a),
    [liveClassCounts]
  );

  const cameras = useMemo(() => {
    if (!streamCameras) return registryCameras ?? [];
    const liveIds = new Set(
      streamCameras.map((c) => resolveDetectionCameraId(c.id).toLowerCase())
    );
    return (registryCameras ?? []).filter((c) => liveIds.has(c.cameraId.toLowerCase()));
  }, [registryCameras, streamCameras]);

  const { data: classTrendSeries, isLoading: seriesLoading } = useClassTrendSeries();
  const { data: liveClassCountsByCamera, isLoading: liveByCameraLoading } = useLiveClassCountsByCamera();
  const { data: classDensityLastHour, isLoading: densityLastHourLoading } = useClassDensityLastHour();

  const occupancyEntries = useMemo(() => Object.values(liveOccupancy), [liveOccupancy]);

  const totalPersons = useMemo(
    () => occupancyEntries.reduce((sum, e) => sum + e.peopleCount, 0),
    [occupancyEntries]
  );

  const reportingCount = occupancyEntries.length;
  const totalCameraCount = cameras.length;
  const reportingPercent =
    totalCameraCount > 0 ? Math.round((reportingCount / totalCameraCount) * 100) : 0;

  const avgDensityLabel = useMemo(() => {
    if (occupancyEntries.length === 0) return "—";
    const avg = totalPersons / occupancyEntries.length;
    return densityTierFromCount(Math.round(avg));
  }, [occupancyEntries, totalPersons]);

  const busiestZones = useMemo(() => {
    const totals = new Map<string, number>();
    occupancyEntries.forEach((e) => {
      if (!e.zone) return;
      totals.set(e.zone, (totals.get(e.zone) ?? 0) + e.peopleCount);
    });
    return Array.from(totals.entries())
      .map(([zone, persons]) => ({ zone, persons }))
      .sort((a, b) => b.persons - a.persons);
  }, [occupancyEntries]);
  const maxZonePersons = busiestZones[0]?.persons || 1;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Analytics"
        description="Live, real-time trends across cameras, zones and alert rules"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {liveClassEntries.length > 0 ? (
          liveClassEntries.map(([className, count]) => (
            <StatCard
              key={className}
              icon={classIcon(className)}
              label={`Total ${classLabel(className)} (Live)`}
              value={formatNumber(count)}
            />
          ))
        ) : (
          <StatCard icon={Users} label="Total Persons (Live)" value={formatNumber(totalPersons)} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Gauge} label="Avg Density" value={avgDensityLabel} />
        <StatCard
          icon={AlertTriangle}
          iconClassName="bg-severity-high/15 text-severity-high"
          label="Active Alert Rules"
          value={formatNumber(alertStats?.byStatus.active ?? 0)}
        />
        <StatCard
          icon={BellRing}
          iconClassName="bg-severity-critical/15 text-severity-critical"
          label="Unseen Alert Matches"
          value={formatNumber(unseenMatchCount)}
        />
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-2 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Detection Trend by Class</h3>
            <p className="text-xs text-muted-foreground">
              Aggregated live object counts across all cameras, by class, last 2 hours
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Radio className="size-3.5" /> {reportingCount}/{totalCameraCount} reporting ({reportingPercent}%)
          </span>
        </div>
        {seriesLoading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : classTrendSeries && classTrendSeries.length > 0 ? (
          <ClassTrendChart data={classTrendSeries} />
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No detection history in this window yet.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-2 p-4">
        <h3 className="mb-1 text-sm font-medium">Camera Density (Live)</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Current object count per camera, broken down by class
        </p>
        {liveByCameraLoading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : liveClassCountsByCamera && liveClassCountsByCamera.length > 0 ? (
          <ClassDensityChart data={liveClassCountsByCamera} />
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Waiting for live detections from cameras…
          </p>
        )}
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-2 p-4">
        <h3 className="mb-1 text-sm font-medium">Camera Density — Last Hour (Peak)</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Highest per-class object count each camera reached in the last hour — answers which
          camera ran busiest vs. quietest recently, not just right now
        </p>
        {densityLastHourLoading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : classDensityLastHour && classDensityLastHour.length > 0 ? (
          <ClassDensityChart data={classDensityLastHour} />
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No detection history in the last hour yet.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-surface-border bg-surface-2 p-4">
          <h3 className="mb-3 text-sm font-medium">Alert Rules by Status</h3>
          {alertStats ? (
            <AlertStatusChart byStatus={alertStats.byStatus} />
          ) : (
            <Skeleton className="h-[220px] w-full" />
          )}
        </div>

        <div className="rounded-xl border border-surface-border bg-surface-2 p-4">
          <h3 className="mb-3 text-sm font-medium">Busiest Zones (Live)</h3>
          <div className="space-y-3">
            {busiestZones.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No live occupancy reported for any zone yet.
              </p>
            )}
            {busiestZones.map(({ zone, persons }) => (
              <div key={zone}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium capitalize">
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: zoneColor(zone) }} />
                    {zone}
                  </span>
                  <span className="text-muted-foreground">{persons} persons</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, (persons / maxZonePersons) * 100)}%`,
                      backgroundColor: zoneColor(zone),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-2 p-4">
        <h3 className="mb-1 text-sm font-medium">Alert Rules Overview</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Every configured region alert, ranked by unread matches
        </p>
        <div className="space-y-1.5">
          {(rules ?? [])
            .map((rule) => ({
              rule,
              unseen: effectiveUnseenCount(rule, baselines[rule.alertId] ?? 0),
            }))
            .sort((a, b) => b.unseen - a.unseen)
            .slice(0, 8)
            .map(({ rule, unseen }) => (
              <div
                key={rule.alertId}
                className="flex items-center justify-between gap-2 rounded-md border border-surface-border bg-surface-1 px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{rule.name ?? rule.alertId}</span>
                <span className="shrink-0 text-muted-foreground">{rule.cameraId}</span>
                <AlertCategoryBadge category={rule.category} className="shrink-0" />
                <span className="shrink-0 capitalize text-muted-foreground">{rule.status}</span>
                <span
                  className={
                    unseen > 0
                      ? "shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 font-medium text-destructive"
                      : "shrink-0 text-muted-foreground"
                  }
                >
                  {unseen} new
                </span>
              </div>
            ))}
          {(!rules || rules.length === 0) && (
            <p className="py-6 text-center text-sm text-muted-foreground">No alert rules configured yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
