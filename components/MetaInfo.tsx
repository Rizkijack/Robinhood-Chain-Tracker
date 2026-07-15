"use client";

import { REFRESH_MS } from "@/lib/constants";
import { useFeedStore, useFilterStore, useUiStore } from "@/lib/store";

export function MetaInfo() {
  const { feed, lastFetch, loading } = useFeedStore();
  const { tab } = useFilterStore();
  const { autoRefresh } = useUiStore();

  const isSearchTab = tab === "search";
  const sources = feed?.sources || [];
  const recommendedRefreshMs = feed?.recommendedRefreshMs;
  const refreshMs = recommendedRefreshMs ?? REFRESH_MS;
  const isLoading = loading && !!feed;

  return (
    <div className="meta-row">
      <div className="live-badge">
        {autoRefresh && !isSearchTab ? (
          <>
            <span className="dot" />
            {isLoading ? (
              <span className="refreshing">Refreshing…</span>
            ) : (
              <>Live · every {Math.round(refreshMs / 1000)}s</>
            )}
          </>
        ) : (
          "Manual refresh"
        )}
        {lastFetch ? (
          <span style={{ marginLeft: 8 }}>
            · updated {lastFetch.toLocaleTimeString()}
          </span>
        ) : null}
      </div>
      <div>
        Sources: {sources.length > 0 ? sources.join(" · ") : "—"}
      </div>
    </div>
  );
}
