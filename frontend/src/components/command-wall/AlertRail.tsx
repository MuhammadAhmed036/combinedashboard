"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";
import { DetectionFrameImage } from "@/components/alerts/DetectionFrameImage";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/formatters";
import {
  useAllAlertEvents,
  useAlertRules,
  useDeleteAlertRule,
  useUpdateAlertRuleStatus,
  useUpdateAlertRuleDetails,
} from "@/lib/hooks/useAlertRules";
import { useCameras } from "@/lib/hooks/useCameras";
import type { AlertMatchEvent, AlertRuleV2, AlertCategory } from "@/lib/types";
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
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// ─── Event Item in Live Feed ──────────────────────────────────────────────────

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
      <div className="flex h-[66px]">
        {/* Left: Picture container — zoom triggers strictly on picture interaction */}
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

          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover/img:opacity-100">
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-white">Zoom</span>
          </div>

          <div
            className="absolute bottom-1 left-1 rounded-[3px] px-1 py-0.2 text-[8px] font-bold text-black leading-none"
            style={{ backgroundColor: classColor }}
          >
            {classLabel(primaryClass)}
          </div>
        </div>

        {/* Right: metadata (hovering here does NOT enlarge picture) */}
        <div className="flex flex-col justify-between min-w-0 flex-1 px-2 py-1.5 select-text">
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

      {/* Enlarged modal/overlay preview */}
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

export function AlertRail() {
  const [activeTab, setActiveTab] = useState<"live" | "rules">("live");

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
  const { data: events, isLoading: eventsLoading, error: eventsError } = useAllAlertEvents(activeFilters);
  const { data: rules, isLoading: rulesLoading } = useAlertRules();
  const { data: cameras } = useCameras();

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
        <div className="min-h-0 flex-1 overflow-y-auto">
          {eventsLoading &&
            Array.from({ length: 6 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-[66px] mx-1.5 my-1 rounded-[8px] border border-surface-border"
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

          {!eventsLoading &&
            !eventsError &&
            events?.map((event: AlertMatchEvent) => (
              <AlertEventItem
                key={`${event.eventId}-${event.id}`}
                event={event}
              />
            ))}
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
    </aside>
  );
}
