"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AlertRuleFilters } from "@/components/alerts/AlertRuleFilters";
import { AlertRulesTable } from "@/components/alerts/AlertRulesTable";
import { AlertRuleDetailPanel } from "@/components/alerts/AlertRuleDetailPanel";
import { Button } from "@/components/ui/button";
import { useAlertRules, useAlertStats } from "@/lib/hooks/useAlertRules";
import { useUIStore } from "@/lib/store/useUIStore";
import type { AlertRuleFilters as AlertRuleFiltersValue } from "@/lib/services/alertRulesService";

export default function AlertsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<AlertRuleFiltersValue>({});
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  const { data: rules, isLoading } = useAlertRules(filters);
  const { data: stats } = useAlertStats();
  const setCreateAlertModalOpen = useUIStore((s) => s.setCreateAlertModalOpen);
  const setSelectedCameraId = useUIStore((s) => s.setSelectedCameraId);
  const queryClient = useQueryClient();

  function handleViewCamera(cameraId: string) {
    setSelectedCameraId(cameraId);
    router.push(`/cameras/${cameraId}`);
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Alerts Management"
        description="Draw a zone to alert when a person enters it, or watch a camera and alert when nobody is present."
        actions={
          <Button
            className="gap-1.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90"
            onClick={() => setCreateAlertModalOpen(true)}
          >
            <Plus className="size-4" /> New Alert Rule
          </Button>
        }
      />

      <AlertRuleFilters
        filters={filters}
        onChange={setFilters}
        stats={stats}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["alert-rules"] })}
      />

      <AlertRulesTable
        rules={rules ?? []}
        isLoading={isLoading}
        onSelectRule={setSelectedAlertId}
        onViewCamera={handleViewCamera}
      />

      <AlertRuleDetailPanel
        alertId={selectedAlertId}
        open={Boolean(selectedAlertId)}
        onOpenChange={(open) => !open && setSelectedAlertId(null)}
      />
    </div>
  );
}
