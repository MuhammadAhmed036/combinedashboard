import Link from "next/link";
import { AlertTriangle, MapPin, Users, Video } from "lucide-react";
import { zoneColor } from "@/components/map/CameraLocationMap";

export function ZoneCard({
  zone,
  cameraCount,
  enabledCount,
  reportingCount,
  totalPersons,
  activeAlerts,
  unseenMatches,
}: {
  zone: string;
  cameraCount: number;
  enabledCount: number;
  reportingCount: number;
  totalPersons: number;
  activeAlerts: number;
  unseenMatches: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-2">
      <div className="h-1.5 w-full" style={{ backgroundColor: zoneColor(zone) }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold capitalize leading-tight">{zone}</h3>
          {unseenMatches > 0 && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
              <AlertTriangle className="size-3" /> {unseenMatches}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {reportingCount}/{cameraCount} cameras reporting live data
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-surface-1 p-2">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <Video className="size-3.5" />
            </div>
            <div className="mt-1 text-sm font-semibold">
              {enabledCount}
              <span className="text-xs font-normal text-muted-foreground">/{cameraCount}</span>
            </div>
            <div className="text-[10px] text-muted-foreground">Enabled</div>
          </div>
          <div className="rounded-lg bg-surface-1 p-2">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <Users className="size-3.5" />
            </div>
            <div className="mt-1 text-sm font-semibold">{totalPersons}</div>
            <div className="text-[10px] text-muted-foreground">Persons</div>
          </div>
          <div className="rounded-lg bg-surface-1 p-2">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <AlertTriangle className="size-3.5" />
            </div>
            <div className="mt-1 text-sm font-semibold">{activeAlerts}</div>
            <div className="text-[10px] text-muted-foreground">Alert Rules</div>
          </div>
        </div>

        <Link
          href="/map-view"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-surface-border py-1.5 text-xs font-medium text-primary hover:bg-surface-3"
        >
          <MapPin className="size-3.5" /> View on Map
        </Link>
      </div>
    </div>
  );
}
