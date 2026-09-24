import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GridLayoutKey, MediaWallAssignment } from "@/lib/types";

interface UIState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;

  selectedCameraId: string | null;
  setSelectedCameraId: (id: string | null) => void;

  selectedAlertId: string | null;
  setSelectedAlertId: (id: string | null) => void;

  isCreateAlertModalOpen: boolean;
  setCreateAlertModalOpen: (open: boolean) => void;

  mediaWallLayout: GridLayoutKey;
  setMediaWallLayout: (layout: GridLayoutKey) => void;
  mediaWallAssignments: MediaWallAssignment[];
  assignCameraToCell: (cellIndex: number, cameraId: string | null) => void;
  clearMediaWallAssignments: () => void;
  addCameraToWall: (cameraId: string, cellCount: number) => void;
  removeCameraFromWall: (cameraId: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),

      selectedCameraId: null,
      setSelectedCameraId: (id) => set({ selectedCameraId: id }),

      selectedAlertId: null,
      setSelectedAlertId: (id) => set({ selectedAlertId: id }),

      isCreateAlertModalOpen: false,
      setCreateAlertModalOpen: (open) => set({ isCreateAlertModalOpen: open }),

      mediaWallLayout: "3x3",
      setMediaWallLayout: (layout) => set({ mediaWallLayout: layout }),
      mediaWallAssignments: [],
      assignCameraToCell: (cellIndex, cameraId) => {
        const current = get().mediaWallAssignments.filter((a) => a.cellIndex !== cellIndex);
        set({ mediaWallAssignments: [...current, { cellIndex, cameraId }] });
      },
      clearMediaWallAssignments: () => set({ mediaWallAssignments: [] }),
      addCameraToWall: (cameraId, cellCount) => {
        const current = get().mediaWallAssignments;
        if (current.some((a) => a.cameraId === cameraId)) return;
        const occupied = new Set(current.map((a) => a.cellIndex));
        let cellIndex = 0;
        while (occupied.has(cellIndex) && cellIndex < cellCount) cellIndex++;
        if (cellIndex >= cellCount) return;
        set({ mediaWallAssignments: [...current, { cellIndex, cameraId }] });
      },
      removeCameraFromWall: (cameraId) => {
        set({
          mediaWallAssignments: get().mediaWallAssignments.filter((a) => a.cameraId !== cameraId),
        });
      },
    }),
    {
      name: "safecity-ui-store",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        mediaWallLayout: state.mediaWallLayout,
        mediaWallAssignments: state.mediaWallAssignments,
      }),
    }
  )
);
