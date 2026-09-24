"use client";

import { useState } from "react";
import { Filter, X, Search, Camera, Clock, AlertTriangle, Shield, Info } from "lucide-react";
import { DetectionFrameImage } from "@/components/alerts/DetectionFrameImage";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/formatters";
import { useAllAlertEvents } from "@/lib/hooks/useAlertRules";
import { useCameras } from "@/lib/hooks/useCameras";
import type { AlertMatchEvent } from "@/lib/types";
import { CATEGORY_ACCENT, CATEGORY_LABEL, classAccent, classLabel } from "./alertVisuals";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  critical: <AlertTriangle className="size-2.5" />,
  medium: <Shield className="size-2.5" />,
  low: <Info className="size-2.5" />,
};

function AlertEventItem({ event }: { event: AlertMatchEvent }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const primaryClass = event.classNames?.[0] ?? "person";
  const categoryColor = CATEGORY_ACCENT[event.category || "medium"];
  const classColor = classAccent(primaryClass);
  const ts = event.detectionTs ?? event.createdAt;

  const isEnlarged = isHovered || isClicked;

  return (
    <article
      className="relative mx-1.5 my-1 overflow-hidden rounded-[8px] bg-surface-2 transition-all duration-200"
      style={{
        border: `1.5px solid ${categoryColor}`,
        boxShadow: `0 0 8px ${categoryColor}20`,
      }}
    >
      {/* Card row: lightweight compact height */}
      <div className="flex h-[66px]">

        {/* Left: Picture container — hover/click ONLY triggers here */}
        <div
          className="group/img relative shrink-0 overflow-hidden bg-black cursor-pointer select-none"
          style={{ width: "48%" }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={(e) => {
            e.stopPropagation();
            setIsClicked((prev) => !prev);
          }}
          title="Click or hover to enlarge image"
        >
          {event.eventId ? (
            <DetectionFrameImage
              eventId={event.eventId}
              alt="Matched frame"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover/img:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <span className="text-[10px]">No Image</span>
            </div>
          )}

          {/* Subtle expand icon overlay on image hover */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover/img:opacity-100">
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-white">Zoom</span>
          </div>

          {/* Class indicator (person = yellow dot/pill) */}
          <div
            className="absolute bottom-1 left-1 rounded-[3px] px-1 py-0.2 text-[8px] font-bold text-black leading-none"
            style={{ backgroundColor: classColor }}
          >
            {classLabel(primaryClass)}
          </div>
        </div>

        {/* Right: metadata (hovering or clicking here does NOT enlarge picture) */}
        <div className="flex flex-col justify-between min-w-0 flex-1 px-2 py-1.5 select-text">
          {/* Rule Name */}
          <div className="truncate text-[11px] font-semibold text-white leading-tight">
            {event.ruleName ?? event.alertId}
          </div>

          {/* Camera Name */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Camera className="size-2.5 shrink-0 text-cyan-400" />
            <span className="truncate">{event.cameraId}</span>
          </div>

          {/* Timestamp */}
          <div className="flex items-center gap-1 text-[9.5px] text-muted-foreground/80">
            <Clock className="size-2.5 shrink-0" />
            <span className="truncate">{ts ? formatDateTime(ts) : "—"}</span>
          </div>
        </div>
      </div>

      {/* Enlarged image preview overlay */}
      <AnimatePresence>
        {isEnlarged && event.eventId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-xs cursor-pointer"
            onClick={() => {
              setIsHovered(false);
              setIsClicked(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.88 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.88 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="relative w-[70vw] max-w-[720px] aspect-video overflow-hidden rounded-xl shadow-2xl bg-black"
              style={{ border: `2px solid ${categoryColor}` }}
              onClick={(e) => e.stopPropagation()}
            >
              <DetectionFrameImage
                eventId={event.eventId}
                alt="Full frame preview"
                className="h-full w-full object-contain bg-black"
              />

              {/* Close (X) button */}
              <button
                onClick={() => {
                  setIsHovered(false);
                  setIsClicked(false);
                }}
                className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black transition-colors"
                title="Close preview"
              >
                <X className="size-4" />
              </button>

              {/* Bottom information banner */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 py-3">
                <div className="text-sm font-semibold text-white truncate">
                  {event.ruleName ?? event.alertId}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-white/70">
                  <span className="flex items-center gap-1">
                    <Camera className="size-3 text-cyan-400" />
                    {event.cameraId}
                  </span>
                  {ts && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatDateTime(ts)}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

export function AlertRail() {
  const [cameraId, setCameraId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    cameraId?: string;
    dateFrom?: string;
    dateTo?: string;
  }>({});

  const { data: events, isLoading, error } = useAllAlertEvents(activeFilters);
  const { data: cameras } = useCameras();

  const handleApplyFilter = () => {
    setActiveFilters({
      cameraId: cameraId === "all" ? undefined : cameraId,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
    });
    setPopoverOpen(false);
  };

  const clearFilters = () => {
    setCameraId("all");
    setDateFrom("");
    setDateTo("");
    setActiveFilters({});
    setPopoverOpen(false);
  };

  const hasActiveFilters =
    Object.values(activeFilters).some((v) => v !== undefined);

  return (
    <aside className="flex min-h-0 flex-col border-l border-surface-border bg-surface-2">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border px-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">Alert History</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {events?.length || 0} events
          </div>
        </div>

        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={hasActiveFilters ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8"
            >
              <Filter className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="end">
            <div className="space-y-4">
              <h4 className="font-medium leading-none">Filter Alerts</h4>

              <div className="space-y-2">
                <Label>Camera</Label>
                <Select value={cameraId} onValueChange={setCameraId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Cameras" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cameras</SelectItem>
                    {cameras?.map((c) => (
                      <SelectItem key={c.id} value={c.code}>
                        {c.name || c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>From Date/Time</Label>
                  <Input
                    type="datetime-local"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>To Date/Time</Label>
                  <Input
                    type="datetime-local"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear
                </Button>
                <Button size="sm" onClick={handleApplyFilter} className="gap-2">
                  <Search className="size-4" /> Search
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Feed */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading &&
          Array.from({ length: 6 }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-[76px] rounded-none border-b border-surface-border"
            />
          ))}
        {!isLoading && (error || !events || events.length === 0) && (
          <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
            <div>
              <X className="mx-auto mb-2 size-5" />
              {error ? "Events API offline" : "No alert events found"}
            </div>
          </div>
        )}
        {!isLoading &&
          !error &&
          events?.map((event: AlertMatchEvent) => (
            <AlertEventItem
              key={`${event.eventId}-${event.id}`}
              event={event}
            />
          ))}
      </div>
    </aside>
  );
}
