"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useAlertRules, useAlertStats } from "@/lib/hooks/useAlertRules";
import { AlertRuleFeedCard } from "@/components/dashboard/AlertRuleFeedCard";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AlertRuleStatus } from "@/lib/types";

const PAGE_SIZE = 10;

const STATUS_TABS: { value: AlertRuleStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
  { value: "muted", label: "Muted" },
];

export function LiveAlertRulesPanel({
  onViewCamera,
  onClose,
}: {
  onViewCamera: (cameraId: string) => void;
  onClose?: () => void;
}) {
  const { data: rules, isLoading } = useAlertRules();
  const { data: stats } = useAlertStats();
  const [statusFilter, setStatusFilter] = useState<AlertRuleStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let list = rules ?? [];
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.name ?? "").toLowerCase().includes(q) ||
          r.cameraId.toLowerCase().includes(q) ||
          (r.zone ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [rules, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-surface-border p-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Live Alert Rules</h3>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
            {stats?.total ?? 0}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-3" aria-label="Close panel">
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="space-y-2.5 border-b border-surface-border p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search alert rules..."
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize",
                statusFilter === tab.value
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-surface-border text-muted-foreground hover:bg-surface-3"
              )}
            >
              {tab.label} {tab.value === "all" ? (stats?.total ?? "") : (stats?.byStatus[tab.value] ?? "")}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        {!isLoading && pageItems.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No alert rules match your filters. Create one from a camera or the Alerts page.
          </p>
        )}
        {pageItems.map((rule) => (
          <AlertRuleFeedCard key={rule.alertId} rule={rule} onViewCamera={onViewCamera} />
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-surface-border p-3 text-xs text-muted-foreground">
        <span>
          Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-
          {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md p-1 hover:bg-surface-3 disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-md p-1 hover:bg-surface-3 disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
