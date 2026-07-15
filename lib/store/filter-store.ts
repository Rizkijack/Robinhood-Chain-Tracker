import { create } from "zustand";

export type Tab = "new" | "trending" | "boosts" | "search";

interface FilterState {
  tab: Tab;
  query: string;
  searchInput: string;
  maxAgeHours: string;
  minLiq: string;
  minVol: string;
  dexFilter: string;

  setTab: (tab: Tab) => void;
  setQuery: (query: string) => void;
  setSearchInput: (input: string) => void;
  setMaxAgeHours: (value: string) => void;
  setMinLiq: (value: string) => void;
  setMinVol: (value: string) => void;
  setDexFilter: (value: string) => void;
  onSearchSubmit: () => void;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  tab: "new",
  query: "",
  searchInput: "",
  maxAgeHours: "24",
  minLiq: "",
  minVol: "",
  dexFilter: "all",

  setTab: (tab) => set({ tab }),
  setQuery: (query) => set({ query }),
  setSearchInput: (searchInput) => set({ searchInput }),
  setMaxAgeHours: (maxAgeHours) => set({ maxAgeHours }),
  setMinLiq: (minLiq) => set({ minLiq }),
  setMinVol: (minVol) => set({ minVol }),
  setDexFilter: (dexFilter) => set({ dexFilter }),

  onSearchSubmit: () => {
    const { searchInput } = get();
    set({ tab: "search", query: searchInput.trim() });
  },
}));
