"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ZoneCard } from "@/components/zones/ZoneCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useZoneSummaries } from "@/lib/hooks/useCameraLocations";
import { useLiveCameraOccupancy } from "@/lib/hooks/useLiveCameraOccupancy";
import { useAlertRules } from "@/lib/hooks/useAlertRules";
import { useAlertSeenBaselineStore } from "@/lib/store/useAlertSeenBaselineStore";
import { effectiveUnseenCount } from "@/lib/alertUnseen";

interface ZoneStats {
  persons: number;
  reporting: number;
  activeAlerts: number;
  unseenMatches: number;
}

export default function ZonesPage() {
  const { data: zoneSummaries, isLoading } = useZoneSummaries();
  const liveOccupancy = useLiveCameraOccupancy();
  const { data: rules } = useAlertRules();
  const baselines = useAlertSeenBaselineStore((s) => s.baselines);

  const zoneStats = useMemo(() => {
    const map = new Map<string, ZoneStats>();
    zoneSummaries?.forEach((z) => map.set(z.zone.toLowerCase(), { persons: 0, reporting: 0, activeAlerts: 0, unseenMatches: 0 }));

    Object.values(liveOccupancy).forEach((entry) => {
      if (!entry.zone) return;
      const stats = map.get(entry.zone.toLowerCase());
      if (!stats) return;
      stats.persons += entry.peopleCount;
      stats.reporting += 1;
    });

    rules?.forEach((rule) => {
      if (!rule.zone) return;
      const stats = map.get(rule.zone.toLowerCase());
      if (!stats) return;
      if (rule.status === "active") stats.activeAlerts += 1;
      stats.unseenMatches += effectiveUnseenCount(rule, baselines[rule.alertId] ?? 0);
    });

    return map;
  }, [zoneSummaries, liveOccupancy, rules, baselines]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Zones"
        description="Operational zones from the camera registry, with live occupancy and alert activity"
      />

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      )}

      {zoneSummaries && zoneSummaries.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {zoneSummaries.map((zone) => {
            const stats = zoneStats.get(zone.zone.toLowerCase()) ?? {
              persons: 0,
              reporting: 0,
              activeAlerts: 0,
              unseenMatches: 0,
            };
            return (
              <ZoneCard
                key={zone.zone}
                zone={zone.zone}
                cameraCount={zone.cameraCount}
                enabledCount={zone.enabledCount}
                reportingCount={stats.reporting}
                totalPersons={stats.persons}
                activeAlerts={stats.activeAlerts}
                unseenMatches={stats.unseenMatches}
              />
            );
          })}
        </div>
      )}

      {zoneSummaries && zoneSummaries.length === 0 && (
        <div className="rounded-xl border border-surface-border bg-surface-2 py-16 text-center text-sm text-muted-foreground">
          No zones registered in the camera registry yet.
        </div>
      )}
    </div>
  );
}
