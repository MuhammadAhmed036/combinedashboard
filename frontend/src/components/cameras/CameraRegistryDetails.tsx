import { MapPin, Radio, Building2, Calendar } from "lucide-react";
import type { CameraLocation } from "@/lib/types";
import { formatDateTime } from "@/lib/formatters";

export function CameraRegistryDetails({ camera }: { camera: CameraLocation }) {
  const address = [camera.building, camera.floor, camera.address].filter(Boolean).join(" · ");

  return (
    <div className="rounded-xl border border-surface-border bg-surface-2 p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Radio className="size-4" /> Camera Registry
      </h3>
      <dl className="space-y-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Camera ID</dt>
          <dd className="truncate font-mono font-medium">{camera.cameraId}</dd>
        </div>
        {camera.cameraIp && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">IP Address</dt>
            <dd className="truncate font-mono font-medium">{camera.cameraIp}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Zone</dt>
          <dd className="font-medium">{camera.zone ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Scene</dt>
          <dd className="truncate font-medium">{camera.scene ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Enabled</dt>
          <dd className={camera.enabled ? "font-medium text-status-active" : "font-medium text-destructive"}>
            {camera.enabled ? "Yes" : "No"}
          </dd>
        </div>
        {camera.latitude !== null && camera.longitude !== null && (
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="size-3.5" /> Coordinates
            </dt>
            <dd className="truncate font-mono font-medium">
              {camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}
            </dd>
          </div>
        )}
        {address && (
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1 text-muted-foreground">
              <Building2 className="size-3.5" /> Location
            </dt>
            <dd className="truncate text-right font-medium">{address}</dd>
          </div>
        )}
        {camera.description && (
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">Description</dt>
            <dd className="text-right font-medium">{camera.description}</dd>
          </div>
        )}
        {camera.createdAt && (
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="size-3.5" /> Registered
            </dt>
            <dd className="font-medium">{formatDateTime(camera.createdAt)}</dd>
          </div>
        )}
        {camera.updatedAt && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Last Updated</dt>
            <dd className="font-medium">{formatDateTime(camera.updatedAt)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
