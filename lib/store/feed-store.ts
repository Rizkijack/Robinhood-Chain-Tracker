import { create } from "zustand";
import type { FeedResponse, StatsResponse } from "@/lib/types";

interface FeedState {
  feed: FeedResponse | null;
  stats: StatsResponse | null;
  loading: boolean;
  error: string | null;
  lastFetch: Date | null;

  setFeed: (feed: FeedResponse | null) => void;
  setStats: (stats: StatsResponse | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastFetch: (date: Date | null) => void;

  loadFeed: (tab: string, query: string) => Promise<void>;
  loadStats: () => Promise<void>;
}

export const useFeedStore = create<FeedState>((set) => ({
  feed: null,
  stats: null,
  loading: true,
  error: null,
  lastFetch: null,

  setFeed: (feed) => set({ feed }),
  setStats: (stats) => set({ stats }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setLastFetch: (lastFetch) => set({ lastFetch }),

  loadFeed: async (tab, query) => {
    set({ loading: true, error: null });
    try {
      let url = `/api/pairs/${tab}`;
      if (tab === "search") {
        if (!query.trim()) {
          set({
            feed: {
              updatedAt: new Date().toISOString(),
              chain: {
                id: "robinhood",
                name: "Robinhood Chain",
                chainId: 4663,
                nativeGas: "ETH",
              },
              sources: [],
              count: 0,
              pairs: [],
            },
            loading: false,
          });
          return;
        }
        url = `/api/pairs/search?q=${encodeURIComponent(query)}`;
      }

      const res = await fetch(url);
      const data = (await res.json()) as FeedResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      set({ feed: data, lastFetch: new Date() });

      if (data.errors?.length) {
        set({
          error: data.errors
            .map((e: { source: string; message: string }) => `${e.source}: ${e.message}`)
            .join(" · "),
        });
      }
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  loadStats: async () => {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) {
        const stats = (await res.json()) as StatsResponse;
        set({ stats });
      }
    } catch {
      /* non-critical */
    }
  },
}));
