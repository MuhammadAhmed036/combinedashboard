"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeftRight,
  Radio,
  SlidersHorizontal,
  RotateCcw,
  Save,
  Download,
  Check,
  Grid,
} from "lucide-react";
import { LunaEventsRail } from "@/components/luna/LunaEventsRail";
import { Button } from "@/components/ui/button";
import { GridLayoutSwitch, gridDimensions } from "@/components/media-wall/GridLayoutSwitch";
import { CameraLibraryPanel } from "@/components/media-wall/CameraLibraryPanel";
import { useZones } from "@/lib/hooks/useZones";
import { useUIStore } from "@/lib/store/useUIStore";
import { useCustomizeWallStore } from "@/lib/store/useCustomizeWallStore";
import type { Camera, GridLayoutKey, MediaWallAssignment } from "@/lib/types";

const STORAGE_KEY = "safecity_mediawall_custom_config";

export function CustomizeWallContent({ cameras = [] }: { cameras?: Camera[] }) {
  const layout = useUIStore((s) => s.mediaWallLayout);
  const setLayout = useUIStore((s) => s.setMediaWallLayout);
  const assignments = useUIStore((s) => s.mediaWallAssignments);
  const assignCameraToCell = useUIStore((s) => s.assignCameraToCell);
  const clearMediaWallAssignments = useUIStore((s) => s.clearMediaWallAssignments);
  const toggleCustomizingWall = useCustomizeWallStore((s) => s.toggleCustomizingWall);

  const { data: zones = [] } = useZones();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [saveToast, setSaveToast] = useState(false);

  const dims = gridDimensions(layout);
  const cellCount = dims * dims;

  const assignedCameraIds = useMemo(
    () => new Set(assignments.map((a) => a.cameraId).filter(Boolean) as string[]),
    [assignments]
  );

  const toggleFavorite = (cameraId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(cameraId)) next.delete(cameraId);
      else next.add(cameraId);
      return next;
    });
  };

  const handleAutoFill = () => {
    if (!cameras || cameras.length === 0) return;
    const working = cameras.filter((c) => c.status === "online");
    const pool = working.length > 0 ? working : cameras;

    const newAssignments: MediaWallAssignment[] = [];
    for (let i = 0; i < cellCount; i++) {
      const cam = pool[i % pool.length];
      assignCameraToCell(i, cam.id);
      newAssignments.push({ cellIndex: i, cameraId: cam.id });
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ layout, assignments: newAssignments, savedAt: new Date().toISOString() })
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveConfig = () => {
    const configData = {
      layout,
      assignments,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configData));
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2200);
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  };

  const handleDownloadJSON = () => {
    const configData = {
      layout,
      assignments,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mediawall-layout-${layout}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full w-full flex-col border-r border-cyan-500/20 bg-slate-950 text-slate-200 select-none overflow-hidden">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border px-3 bg-surface-2/60">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-cyan-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-100">Customize Wall</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleCustomizingWall}
          className="h-7 px-2 text-[11px] text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/40 gap-1.5"
          title="Return to Luna Stream"
        >
          <ArrowLeftRight className="size-3" />
          <span>Luna Feed</span>
        </Button>
      </div>

      {/* Grid Settings & Presets */}
      <div className="p-3 border-b border-surface-border space-y-3 bg-surface-1/40 shrink-0">
        <GridLayoutSwitch
          value={layout}
          onChange={(v: GridLayoutKey) => {
            setLayout(v);
            try {
              localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ layout: v, assignments, savedAt: new Date().toISOString() })
              );
            } catch {}
          }}
        />

        {/* Quick Grid Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] text-cyan-300 hover:text-cyan-200 border-cyan-500/30 hover:border-cyan-400 bg-cyan-950/30 gap-1.5 justify-center"
            onClick={handleAutoFill}
            title="Auto-fill all slots sequentially"
          >
            <Grid className="size-3" /> Auto-Fill
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5 justify-center border border-white/5"
            onClick={() => {
              clearMediaWallAssignments();
              try {
                localStorage.setItem(
                  STORAGE_KEY,
                  JSON.stringify({ layout, assignments: [], savedAt: new Date().toISOString() })
                );
              } catch {}
            }}
            title="Clear all cameras from grid"
          >
            <RotateCcw className="size-3" /> Reset Grid
          </Button>
        </div>

        {/* Save & Export JSON buttons */}
        <div className="flex items-center gap-2 pt-0.5">
          <Button
            size="sm"
            className="flex-1 h-7 text-[11px] gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
            onClick={handleSaveConfig}
          >
            {saveToast ? <Check className="size-3.5 text-green-300" /> : <Save className="size-3.5" />}
            <span>{saveToast ? "Saved!" : "Save (JSON)"}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground border-surface-border"
            onClick={handleDownloadJSON}
            title="Export layout configuration as JSON file"
          >
            <Download className="size-3" />
          </Button>
        </div>
      </div>

      {/* Draggable Camera Library */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CameraLibraryPanel
          cameras={cameras}
          zones={zones}
          favoriteIds={favoriteIds}
          onToggleFavorite={toggleFavorite}
          assignedCameraIds={assignedCameraIds}
        />
      </div>
    </div>
  );
}

export function LeftRailContainer({
  cameras = [],
}: {
  cameras?: Camera[];
}) {
  const isCustomizingWall = useCustomizeWallStore((s) => s.isCustomizingWall);
  const toggleCustomizingWall = useCustomizeWallStore((s) => s.toggleCustomizingWall);

  return (
    <div className="relative z-30 flex h-full w-full min-h-0 min-w-0 overflow-visible">
      {/* ── Seamless Animated Content Switcher ──────────────────────────────── */}
      <div className="size-full overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {isCustomizingWall ? (
            <motion.div
              key="customize-rail"
              className="size-full"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
            >
              <CustomizeWallContent cameras={cameras} />
            </motion.div>
          ) : (
            <motion.div
              key="luna-rail"
              className="size-full"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
            >
              <LunaEventsRail />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Floating Tactical Switch Button on Rail Edge (<->) ───────────────── */}
      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleCustomizingWall();
        }}
        whileHover={{ scale: 1.18, boxShadow: "0 0 20px rgba(6,182,212,0.9)" }}
        whileTap={{ scale: 0.9 }}
        style={{
          position: "absolute",
          right: "-14px",
          top: "40%",
          zIndex: 9999,
        }}
        className="flex size-7 items-center justify-center rounded-full bg-[#060a14] border-2 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.7)] hover:border-cyan-300 hover:text-white cursor-pointer pointer-events-auto"
        title={isCustomizingWall ? "Switch back to Luna Stream" : "Switch to Customize Wall"}
        aria-label="Toggle Customize Wall Panel"
      >
        <motion.div
          animate={{ rotate: isCustomizingWall ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 20 }}
          className="flex items-center justify-center"
        >
          {isCustomizingWall ? (
            <Radio className="size-3.5 text-emerald-400" />
          ) : (
            <ArrowLeftRight className="size-3.5 text-cyan-400" />
          )}
        </motion.div>
      </motion.button>
    </div>
  );
}
