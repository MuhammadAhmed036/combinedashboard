"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { CameraCard } from "@/components/cameras/CameraCard";
import { PaginationBar } from "@/components/layout/PaginationBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCameras } from "@/lib/hooks/useCameras";

const PAGE_SIZE = 18;

export function CamerasClient() {
  const { data: cameras, isLoading, error, mutate } = useCameras();
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  // Default to only online cameras — offline/broken ones are still one
  // dropdown selection away via "All Statuses" or "Offline".
  const [statusFilter, setStatusFilter] = useState("online");
  const [page, setPage] = useState(1);

  const zones = useMemo(() => {
    const unique = new Map<string, string>();
    for (const camera of cameras ?? []) unique.set(camera.zoneId, camera.zoneName);
    return Array.from(unique, ([id, name]) => ({ id, name }));
  }, [cameras]);

  const filtered = useMemo(() => {
    let list = cameras ?? [];
    if (zoneFilter !== "all") list = list.filter((camera) => camera.zoneId === zoneFilter);
    if (statusFilter !== "all") {
      list = list.filter((camera) => camera.status === statusFilter);
    }
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      list = list.filter(
        (camera) =>
          camera.name.toLowerCase().includes(query) ||
          camera.code.toLowerCase().includes(query)
      );
    }
    return list;
  }, [cameras, zoneFilter, statusFilter, search]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const onlineCount = cameras?.filter((camera) => camera.status === "online").length ?? 0;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Cameras"
        description={
          cameras
            ? `${cameras.length} cameras · ${onlineCount} online · ${cameras.length - onlineCount} offline`
            : "Live camera streams"
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search cameras by name or code..."
            className="pl-9"
          />
        </div>
        <Select
          value={zoneFilter}
          onValueChange={(value) => {
            setZoneFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All Zones" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Zones</SelectItem>
            {zones.map((zone) => (
              <SelectItem key={zone.id} value={zone.id}>
                {zone.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-12 text-center">
          <div>
            <p className="text-sm font-medium text-destructive">Camera API is unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => mutate()}>
            <RefreshCw className="size-3.5" /> Retry
          </Button>
        </div>
      )}

      {isLoading && !error && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/3.6] w-full rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && !error && pageItems.length === 0 && (
        <div className="rounded-xl border border-surface-border bg-surface-2 py-16 text-center text-sm text-muted-foreground">
          No cameras match your filters.
        </div>
      )}

      {!error && pageItems.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {pageItems.map((camera) => (
            <CameraCard key={camera.id} camera={camera} />
          ))}
        </div>
      )}

      {!error && filtered.length > 0 && (
        <PaginationBar
          page={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
