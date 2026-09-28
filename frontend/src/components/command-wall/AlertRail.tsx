"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Filter,
  X,
  Search,
  Camera,
  Clock,
  Pencil,
  Trash2,
  Play,
  Pause,
  Activity,
  Check,
  Radio,
  SlidersHorizontal,
  Download,
  Copy,
  Maximize2,
} from "lucide-react";
import { DetectionFrameImage } from "@/components/alerts/DetectionFrameImage";
import { liveEventImageUrl } from "@/lib/hooks/useCameraLiveFeed";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/formatters";
import {
  useAllAlertEvents,
  useAlertRules,
  useDeleteAlertRule,
  useUpdateAlertRuleStatus,
  useUpdateAlertRuleDetails,
} from "@/lib/hooks/useAlertRules";
import type { AlertMatchEvent, AlertRuleV2, AlertCategory, Camera as CameraType } from "@/lib/types";
import { CATEGORY_ACCENT, CATEGORY_LABEL, classAccent, classLabel } from "./alertVisuals";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Virtual Scroller Constants ───────────────────────────────────────────────
const ITEM_HEIGHT = 74; // 66px card + 8px margin
const OVERSCAN = 5;

// ─── Event Item in Live Feed ──────────────────────────────────────────────────

function AlertEventItem({
  event,
  onInspect,
}: {
  event: AlertMatchEvent;
  onInspect: (event: AlertMatchEvent) => void;
}) {
  const primaryClass = event.classNames?.[0] ?? "person";
  const categoryColor = CATEGORY_ACCENT[event.category || "medium"];
  const classColor = classAccent(primaryClass);
  const ts = event.detectionTs ?? event.createdAt;

  return (
    <article
      onClick={() => onInspect(event)}
      className="group relative mx-1.5 my-1 overflow-hidden rounded-[8px] bg-surface-2 cursor-pointer transition-all duration-150 hover:bg-surface-3/80 select-none"
      style={{
        height: 66,
        border: `1.5px solid ${categoryColor}`,
        boxShadow: `0 0 8px ${categoryColor}20`,
      }}
    >
      <div className="flex h-full">
        {/* Left: Picture container */}
        <div
          className="relative shrink-0 overflow-hidden bg-surface-3"
          style={{ width: "48%" }}
        >
          {event.eventId ? (
            <DetectionFrameImage
              eventId={event.eventId}
              alt="Matched frame"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <span className="text-[10px]">No Image</span>
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-medium text-white shadow flex items-center gap-1">
              <Maximize2 className="size-2.5 text-cyan-400" />
              Forensic
            </span>
          </div>

          <div
            className="absolute bottom-1 left-1 rounded-[3px] px-1 py-0.2 text-[8px] font-bold text-black leading-none"
            style={{ backgroundColor: classColor }}
          >
            {classLabel(primaryClass)}
          </div>
        </div>

        {/* Right: metadata */}
        <div className="flex flex-col justify-between min-w-0 flex-1 px-2 py-1.5">
          <div className="truncate text-[11px] font-semibold text-white leading-tight">
            {event.ruleName ?? event.alertId}
          </div>

          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Camera className="size-2.5 shrink-0 text-cyan-400" />
            <span className="truncate">{event.cameraId}</span>
          </div>

          <div className="flex items-center gap-1 text-[9.5px] text-muted-foreground/80">
            <Clock className="size-2.5 shrink-0" />
            <span className="truncate">{ts ? formatDateTime(ts) : "—"}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Virtualized Alert Feed (Maintains 60 FPS under 1,000+ alerts) ───────────

function VirtualAlertEventList({
  events,
  onInspect,
}: {
  events: AlertMatchEvent[];
  onInspect: (event: AlertMatchEvent) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateHeight = () => {
      if (el.clientHeight > 0) {
        setContainerHeight(el.clientHeight);
      }
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalHeight = events.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    events.length,
    Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN
  );

  const visibleEvents = events.slice(startIndex, endIndex);
  const offsetY = startIndex * ITEM_HEIGHT;

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="min-h-0 flex-1 overflow-y-auto will-change-scroll"
      style={{ position: "relative" }}
    >
      <div style={{ height: `${totalHeight}px`, width: "100%", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${offsetY}px)`,
          }}
        >
          {visibleEvents.map((event, idx) => (
            <AlertEventItem
              key={`${event.eventId || "evt"}-${event.id || startIndex + idx}`}
              event={event}
              onInspect={onInspect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Forensic Evidence Modal (High-Res Frame + Telemetry + Export) ─────────────

function ForensicEvidenceModal({
  event,
  onClose,
}: {
  event: AlertMatchEvent | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!event) return null;

  const categoryColor = CATEGORY_ACCENT[event.category || "medium"];
  const primaryClass = event.classNames?.[0] ?? "person";
  const ts = event.detectionTs ?? event.createdAt;
  const imageUrl = event.eventId ? liveEventImageUrl(event.eventId) : null;

  const handleDownload = () => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `evidence_${event.cameraId}_${event.eventId || Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyLog = () => {
    const logData = JSON.stringify(
      {
        eventId: event.eventId,
        ruleName: event.ruleName ?? event.alertId,
        alertId: event.alertId,
        cameraId: event.cameraId,
        timestamp: ts,
        primaryClass,
        insideCount: event.personCountInside,
        outsideCount: event.personCountOutside,
        classCountsInside: event.classCountsInside,
        classCountsOutside: event.classCountsOutside,
        boundingBox: event.boundingBox,
      },
      null,
      2
    );
    navigator.clipboard.writeText(logData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={Boolean(event)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[92vw] p-0 overflow-hidden bg-surface-1 border-surface-border text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border bg-surface-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0 animate-ping"
              style={{ backgroundColor: categoryColor }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white truncate">
                  {event.ruleName ?? event.ruleLabel ?? event.alertId}
                </h3>
                <span
                  className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider shrink-0"
                  style={{ backgroundColor: categoryColor }}
                >
                  {CATEGORY_LABEL[event.category || "medium"]}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                <span className="flex items-center gap-1 text-cyan-400">
                  <Camera className="size-3" />
                  {event.cameraId}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {ts ? formatDateTime(ts) : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
          {/* Main Visual Frame */}
          <div className="md:col-span-2 relative aspect-video bg-black flex items-center justify-center overflow-hidden border-b md:border-b-0 md:border-r border-surface-border">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Forensic Frame"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-muted-foreground text-xs">No forensic frame captured</div>
            )}
          </div>

          {/* Forensic Metadata & Export Panel */}
          <div className="flex flex-col justify-between p-3.5 bg-surface-2/60 text-xs space-y-3">
            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  Forensic Event ID
                </span>
                <p className="font-mono text-[11px] text-cyan-300 break-all select-all mt-0.5">
                  {event.eventId || "N/A"}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  Detection Summary
                </span>
                <div className="mt-1 space-y-1 bg-surface-3/70 rounded p-2 border border-white/5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-muted-foreground">Primary Object:</span>
                    <span className="font-semibold text-white capitalize">{primaryClass}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-muted-foreground">Inside Region:</span>
                    <span className="font-bold text-amber-400">{event.personCountInside ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-muted-foreground">Outside Region:</span>
                    <span className="font-semibold text-white">{event.personCountOutside ?? 0}</span>
                  </div>
                </div>
              </div>

              {event.boundingBox && (
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Bounding Box Coordinates
                  </span>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground bg-surface-3/70 rounded p-1.5 border border-white/5">
                    [{event.boundingBox.x1}, {event.boundingBox.y1}] to [{event.boundingBox.x2}, {event.boundingBox.y2}]
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2 border-t border-surface-border">
              {imageUrl && (
                <Button
                  onClick={handleDownload}
                  size="sm"
                  className="w-full gap-1.5 h-8 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
                >
                  <Download className="size-3.5" />
                  Download Frame (.JPG)
                </Button>
              )}

              <Button
                onClick={handleCopyLog}
                variant="outline"
                size="sm"
                className="w-full gap-1.5 h-8 text-xs border-surface-border hover:bg-surface-3"
              >
                {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
                {copied ? "Copied to Clipboard" : "Copy Forensic Log"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rule Card in Rules Tab ───────────────────────────────────────────────────

function ConfiguredRuleItem({
  rule,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  rule: AlertRuleV2;
  onEdit: (rule: AlertRuleV2) => void;
  onDelete: (rule: AlertRuleV2) => void;
  onToggleStatus: (rule: AlertRuleV2) => void;
}) {
  const categoryColor = CATEGORY_ACCENT[rule.category || "medium"];
  const isActive = rule.status === "active";

  return (
    <article
      className="relative mx-1.5 my-1.5 rounded-[8px] bg-surface-2 p-2.5 transition-all"
      style={{
        border: `1.5px solid ${categoryColor}80`,
        boxShadow: `0 0 6px ${categoryColor}15`,
      }}
    >
      {/* Top: Name & Category Indicator */}
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold text-white leading-tight">
            {rule.name || rule.label || rule.alertId}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
            <Camera className="size-2.5 text-cyan-400" />
            <span className="truncate">{rule.cameraId}</span>
          </div>
        </div>

        {/* Category Pill */}
        <span
          className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[8.5px] font-bold text-white uppercase tracking-wider"
          style={{ backgroundColor: categoryColor }}
        >
          {CATEGORY_LABEL[rule.category || "medium"]}
        </span>
      </div>

      {/* Middle: Trigger Counts */}
      <div className="my-2 rounded-[5px] bg-black/40 px-2 py-1.5 flex items-center justify-between text-[11px] border border-white/5">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Activity className="size-3 text-cyan-400" />
          <span>Total Alerts:</span>
          <span className="font-bold font-mono text-white text-xs">{rule.eventCount}</span>
        </div>
        {rule.unseenCount > 0 && (
          <span className="rounded bg-destructive/80 px-1 py-0.2 text-[9px] font-bold text-white">
            +{rule.unseenCount} new
          </span>
        )}
      </div>

      {/* Bottom: Action buttons (Status toggle, Edit, Delete) */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        {/* Status Toggle */}
        <button
          onClick={() => onToggleStatus(rule)}
          className={cn(
            "flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-medium transition-colors",
            isActive
              ? "bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/30"
              : "bg-surface-3 text-muted-foreground hover:bg-surface-3/80 border border-surface-border"
          )}
          title={isActive ? "Rule is active (click to pause)" : "Rule is paused (click to activate)"}
        >
          {isActive ? <Play className="size-2.5 fill-current" /> : <Pause className="size-2.5" />}
          <span>{isActive ? "Active" : "Paused"}</span>
        </button>

        <div className="flex items-center gap-1">
          {/* Edit Button */}
          <button
            onClick={() => onEdit(rule)}
            className="flex size-6 items-center justify-center rounded-[4px] bg-surface-3 text-muted-foreground hover:bg-cyan-500/20 hover:text-cyan-400 transition-colors"
            title="Edit rule name and category"
          >
            <Pencil className="size-3" />
          </button>

          {/* Delete Button */}
          <button
            onClick={() => onDelete(rule)}
            className="flex size-6 items-center justify-center rounded-[4px] bg-surface-3 text-muted-foreground hover:bg-destructive hover:text-white transition-colors"
            title="Delete this alert rule"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Main AlertRail Component ─────────────────────────────────────────────────

export function AlertRail({ cameras }: { cameras: CameraType[] | undefined }) {
  const [activeTab, setActiveTab] = useState<"live" | "rules">("live");
  const [inspectedEvent, setInspectedEvent] = useState<AlertMatchEvent | null>(null);

  // Filters for Live Events
  const [cameraId, setCameraId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    cameraId?: string;
    dateFrom?: string;
    dateTo?: string;
  }>({});

  // Filter for Rules Tab
  const [ruleCameraFilter, setRuleCameraFilter] = useState<string>("all");

  // Edit Dialog State
  const [editingRule, setEditingRule] = useState<AlertRuleV2 | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<AlertCategory>("medium");
  const [editStatus, setEditStatus] = useState("active");

  // Delete Confirmation State
  const [deletingRule, setDeletingRule] = useState<AlertRuleV2 | null>(null);

  // Queries & Mutations
  const { data: events, isLoading: eventsLoading, error: eventsError } = useAllAlertEvents(
    activeTab === "live" ? activeFilters : undefined
  );
  const { data: rules, isLoading: rulesLoading } = useAlertRules(
    activeTab === "rules" ? {} : undefined
  );

  const deleteRuleMutation = useDeleteAlertRule();
  const updateStatusMutation = useUpdateAlertRuleStatus();
  const updateDetailsMutation = useUpdateAlertRuleDetails();

  const hasActiveFilters = Object.values(activeFilters).some((v) => v !== undefined);

  // Filtered Rules
  const filteredRules = useMemo(() => {
    if (!rules) return [];
    if (ruleCameraFilter === "all") return rules;
    return rules.filter(
      (r) => r.cameraId.toLowerCase() === ruleCameraFilter.toLowerCase()
    );
  }, [rules, ruleCameraFilter]);

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

  const openEditDialog = (rule: AlertRuleV2) => {
    setEditingRule(rule);
    setEditName(rule.name || rule.label || "");
    setEditCategory(rule.category || "medium");
    setEditStatus(rule.status || "active");
  };

  const handleSaveEdit = async () => {
    if (!editingRule) return;
    await updateDetailsMutation.mutateAsync({
      alertId: editingRule.alertId,
      name: editName.trim() || undefined,
      category: editCategory,
      status: editStatus,
    });
    setEditingRule(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingRule) return;
    await deleteRuleMutation.mutateAsync(deletingRule.alertId);
    setDeletingRule(null);
  };

  const handleToggleStatus = (rule: AlertRuleV2) => {
    const nextStatus = rule.status === "active" ? "muted" : "active";
    updateStatusMutation.mutate({ alertId: rule.alertId, status: nextStatus });
  };

  return (
    <aside className="flex min-h-0 flex-col border-l border-surface-border bg-surface-2 overflow-hidden">
      {/* Top Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border px-3 bg-surface-2">
        <div className="flex items-center gap-2 min-w-0">
          {activeTab === "live" ? (
            hasActiveFilters ? (
              <span className="truncate text-sm font-semibold text-amber-400">
                Alert History
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-status-active animate-pulse" />
                <span className="truncate text-sm font-semibold text-white">Live Alerts</span>
              </div>
            )
          ) : (
            <span className="truncate text-sm font-semibold text-white">Configured Rules</span>
          )}

          <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            {activeTab === "live" ? events?.length || 0 : filteredRules.length}
          </span>
        </div>

        {/* Action icons in header */}
        <div className="flex items-center gap-1">
          {activeTab === "live" && (
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={hasActiveFilters ? "default" : "ghost"}
                  size="icon"
                  className={cn("h-7 w-7 rounded-[5px]", hasActiveFilters && "bg-cyan-500 text-black hover:bg-cyan-400")}
                  title="Filter alert history"
                >
                  <Filter className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
                <div className="space-y-4">
                  <h4 className="font-medium leading-none text-xs">Filter Alerts</h4>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Camera</Label>
                    <Select value={cameraId} onValueChange={setCameraId}>
                      <SelectTrigger className="h-8 text-xs">
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
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">From Date/Time</Label>
                      <Input
                        type="datetime-local"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-8 text-[11px]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">To Date/Time</Label>
                      <Input
                        type="datetime-local"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-8 text-[11px]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                      Clear
                    </Button>
                    <Button size="sm" onClick={handleApplyFilter} className="h-7 text-xs gap-1.5">
                      <Search className="size-3.5" /> Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {activeTab === "rules" && (
            <Select value={ruleCameraFilter} onValueChange={setRuleCameraFilter}>
              <SelectTrigger className="h-7 text-[11px] w-28 px-2">
                <SelectValue placeholder="All Cams" />
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
          )}
        </div>
      </div>

      {/* Tabs Bar: Live Alerts vs Configured Rules */}
      <div className="flex border-b border-surface-border bg-surface-1/50 p-1 gap-1">
        <button
          onClick={() => setActiveTab("live")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-[5px] py-1 text-xs font-semibold transition-all",
            activeTab === "live"
              ? "bg-surface-3 text-white shadow-xs border border-white/10"
              : "text-muted-foreground hover:text-white"
          )}
        >
          <Radio className="size-3 text-cyan-400" />
          <span>{hasActiveFilters ? "History" : "Live Alerts"}</span>
        </button>

        <button
          onClick={() => setActiveTab("rules")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-[5px] py-1 text-xs font-semibold transition-all",
            activeTab === "rules"
              ? "bg-surface-3 text-white shadow-xs border border-white/10"
              : "text-muted-foreground hover:text-white"
          )}
        >
          <SlidersHorizontal className="size-3 text-cyan-400" />
          <span>Rules ({rules?.length ?? 0})</span>
        </button>
      </div>

      {/* Tab 1: Live Feed / Alert History */}
      {activeTab === "live" && (
        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          {eventsLoading &&
            Array.from({ length: 6 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-[66px] mx-1.5 my-1 rounded-[8px] border border-surface-border shrink-0"
              />
            ))}

          {!eventsLoading && (eventsError || !events || events.length === 0) && (
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
              <div>
                <X className="mx-auto mb-2 size-5 opacity-50" />
                {eventsError ? "Events service offline" : hasActiveFilters ? "No events match this filter" : "No live alerts detected"}
              </div>
            </div>
          )}

          {!eventsLoading && !eventsError && events && events.length > 0 && (
            <VirtualAlertEventList
              events={events}
              onInspect={setInspectedEvent}
            />
          )}
        </div>
      )}

      {/* Tab 2: Configured Alert Rules */}
      {activeTab === "rules" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rulesLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 mx-1.5 my-2 rounded-[8px] border border-surface-border" />
            ))}

          {!rulesLoading && filteredRules.length === 0 && (
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
              <div>
                <SlidersHorizontal className="mx-auto mb-2 size-5 opacity-40" />
                No alert rules configured for this filter.
              </div>
            </div>
          )}

          {!rulesLoading &&
            filteredRules.map((rule) => (
              <ConfiguredRuleItem
                key={rule.alertId}
                rule={rule}
                onEdit={openEditDialog}
                onDelete={setDeletingRule}
                onToggleStatus={handleToggleStatus}
              />
            ))}
        </div>
      )}

      {/* Edit Rule Dialog */}
      <Dialog open={Boolean(editingRule)} onOpenChange={(open) => !open && setEditingRule(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Edit Alert Rule</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Rule Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Rule Name"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Severity Category</Label>
              <Select value={editCategory} onValueChange={(v) => setEditCategory(v as AlertCategory)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical / High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="muted">Paused / Muted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setEditingRule(null)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={updateDetailsMutation.isPending}
              className="h-8 text-xs gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              <Check className="size-3.5" />
              <span>{updateDetailsMutation.isPending ? "Saving..." : "Save Changes"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Rule Confirmation Dialog */}
      <Dialog open={Boolean(deletingRule)} onOpenChange={(open) => !open && setDeletingRule(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-destructive flex items-center gap-1.5">
              <Trash2 className="size-4" /> Delete Alert Rule
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 text-xs text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-white">
              {deletingRule?.name || deletingRule?.label || deletingRule?.alertId}
            </span>
            ? This will remove the rule and stop tracking alerts for it.
          </div>

          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setDeletingRule(null)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={deleteRuleMutation.isPending}
              className="h-8 text-xs gap-1.5"
            >
              <Trash2 className="size-3.5" />
              <span>{deleteRuleMutation.isPending ? "Deleting..." : "Delete Rule"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Central Forensic Evidence Modal */}
      <ForensicEvidenceModal
        event={inspectedEvent}
        onClose={() => setInspectedEvent(null)}
      />
    </aside>
  );
}
