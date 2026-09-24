"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Camera, Zone } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DraggableCameraItem } from "@/components/media-wall/DraggableCameraItem";

export function CameraLibraryPanel({
  cameras,
  zones,
  favoriteIds,
  onToggleFavorite,
  assignedCameraIds,
}: {
  cameras: Camera[];
  zones: Zone[];
  favoriteIds: Set<string>;
  onToggleFavorite: (cameraId: string) => void;
  assignedCameraIds: Set<string>;
}) {
  const [tab, setTab] = useState<"zone" | "favorites">("zone");
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = cameras.filter((c) => {
      if (tab === "favorites" && !favoriteIds.has(c.id)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
    });
    const zoneById = new Map(
      zones.map((zone) => [zone.id, { id: zone.id, name: zone.name, color: zone.color }])
    );
    const groups = new Map<
      string,
      { zone: { id: string; name: string; color: string }; cameras: Camera[] }
    >();

    for (const camera of filtered) {
      const zone = zoneById.get(camera.zoneId) ?? {
        id: camera.zoneId,
        name: camera.zoneName,
        color: "#3b82f6",
      };
      const group = groups.get(zone.id) ?? { zone, cameras: [] };
      group.cameras.push(camera);
      groups.set(zone.id, group);
    }

    return Array.from(groups.values());
  }, [cameras, zones, tab, search, favoriteIds]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-surface-border p-3">
        <h3 className="mb-2 text-sm font-semibold">Camera Library</h3>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "zone" | "favorites")}>
          <TabsList className="w-full">
            <TabsTrigger value="zone" className="flex-1">By Zone</TabsTrigger>
            <TabsTrigger value="favorites" className="flex-1">Favorites</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative mt-2.5">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cameras, zones..."
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {grouped.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No cameras found.</p>
        )}
        {grouped.map(({ zone, cameras: zoneCameras }) => (
          <div key={zone.id} className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: zone.color }} />
              {zone.name} ({zoneCameras.length})
            </div>
            <div className="space-y-1">
              {zoneCameras.map((camera) => (
                <DraggableCameraItem
                  key={camera.id}
                  camera={camera}
                  isFavorite={favoriteIds.has(camera.id)}
                  onToggleFavorite={() => onToggleFavorite(camera.id)}
                  disabled={assignedCameraIds.has(camera.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
