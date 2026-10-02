import { create } from "zustand";

interface CustomizeWallState {
  isCustomizingWall: boolean;
  setIsCustomizingWall: (open: boolean) => void;
  toggleCustomizingWall: () => void;
  isTraceModalOpen: boolean;
  setIsTraceModalOpen: (open: boolean) => void;
}

export const useCustomizeWallStore = create<CustomizeWallState>((set, get) => ({
  isCustomizingWall: false,
  setIsCustomizingWall: (open) => set({ isCustomizingWall: open }),
  toggleCustomizingWall: () => set({ isCustomizingWall: !get().isCustomizingWall }),
  isTraceModalOpen: false,
  setIsTraceModalOpen: (open) => set({ isTraceModalOpen: open }),
}));

export default useCustomizeWallStore;
