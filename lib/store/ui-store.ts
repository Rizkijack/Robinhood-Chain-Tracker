import { create } from "zustand";
import type { TrackedPair } from "@/lib/types";

interface UiState {
  autoRefresh: boolean;
  selected: TrackedPair | null;

  toggleAutoRefresh: () => void;
  setSelected: (pair: TrackedPair | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  autoRefresh: true,
  selected: null,

  toggleAutoRefresh: () => set((state) => ({ autoRefresh: !state.autoRefresh })),
  setSelected: (selected) => set({ selected }),
}));
