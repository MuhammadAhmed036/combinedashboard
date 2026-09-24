"use client";

import { RotateCw, Search } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AlertRuleFilters as AlertRuleFiltersValue } from "@/lib/services/alertRulesService";
import type { AlertStatsSummary } from "@/lib/types";

export function AlertRuleFilters({
  filters,
  onChange,
  stats,
  onRefresh,
}: {
  filters: AlertRuleFiltersValue;
  onChange: (next: AlertRuleFiltersValue) => void;
  stats: AlertStatsSummary | undefined;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-3">
      <Tabs
        value={filters.status ?? "all"}
        onValueChange={(v) => onChange({ ...filters, status: v === "all" ? undefined : v })}
      >
        <TabsList>
          <TabsTrigger value="all">All Rules {stats?.total ?? ""}</TabsTrigger>
          <TabsTrigger value="active">Active {stats?.byStatus.active ?? ""}</TabsTrigger>
          <TabsTrigger value="resolved">Resolved {stats?.byStatus.resolved ?? ""}</TabsTrigger>
          <TabsTrigger value="muted">Muted {stats?.byStatus.muted ?? ""}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.q ?? ""}
            onChange={(e) => onChange({ ...filters, q: e.target.value })}
            placeholder="Search rules by name, label, description..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 text-xs">
          <button
            onClick={() => onChange({ ...filters, seen: filters.seen === false ? undefined : false })}
            className={
              filters.seen === false
                ? "rounded-full border border-primary bg-primary/15 px-2.5 py-1.5 font-medium text-primary"
                : "rounded-full border border-surface-border px-2.5 py-1.5 font-medium text-muted-foreground hover:bg-surface-3"
            }
          >
            Unseen {stats ? stats.unseen : ""}
          </button>
        </div>
        <Button variant="outline" size="icon" onClick={onRefresh} aria-label="Refresh">
          <RotateCw className="size-4" />
        </Button>
      </div>
    </div>
  );
}
