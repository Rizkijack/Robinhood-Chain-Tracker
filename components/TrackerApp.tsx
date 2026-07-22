"use client";

import { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import type { TrackedPair } from "@/lib/types";
import { REFRESH_MS } from "@/lib/constants";
import { useFeedStore, useFilterStore, useUiStore } from "@/lib/store";
import { ErrorBoundary } from "./ErrorBoundary";
import { SkeletonTable, SkeletonStatCard } from "./Skeleton";
import { Header } from "./Header";
import { StatsBar } from "./StatsBar";
import { Controls } from "./Controls";
import { MetaInfo } from "./MetaInfo";
import { Footer } from "./Footer";
import { PairTable } from "./PairTable";
import { useWatchlist } from "./Watchlist";

// Lazy-load wallet components — only needed when user interacts with wallet
const WalletPortfolio = dynamic(
  () => import("./WalletPortfolio").then((m) => m.WalletPortfolio),
  { ssr: false, loading: () => <div className="portfolio-loading">Loading...</div> }
);
const WatchlistPanel = dynamic(
  () => import("./Watchlist").then((m) => m.WatchlistPanel),
  { ssr: false }
);
const TokenDetailModal = dynamic(
  () => import("./TokenDetailModal").then((m) => m.TokenDetailModal),
  { ssr: false }
);

export function TrackerApp() {
  const { feed, loading, error, loadFeed, loadStats } = useFeedStore();
  const { tab, query, maxAgeHours, minLiq, minVol, dexFilter, setTab } = useFilterStore();
  const { autoRefresh, selected, setSelected } = useUiStore();
  const { items: watchlistItems, remove: removeFromWatchlist } = useWatchlist();

  // Load initial data on mount and when tab/query changes
  useEffect(() => {
    if (tab === "portfolio" || tab === "watchlist") return; // Don't fetch for wallet tabs
    loadStats();
    loadFeed(tab, query);
  }, [loadFeed, loadStats, tab, query]);

  const refreshMs = feed?.recommendedRefreshMs ?? REFRESH_MS;

  // Polling for feed data (pure polling, no SSE)
  useEffect(() => {
    if (tab === "search" || tab === "portfolio" || tab === "watchlist" || !autoRefresh) return;
    const id = setInterval(() => {
      loadFeed(tab, query);
    }, refreshMs);
    return () => clearInterval(id);
  }, [autoRefresh, tab, loadFeed, refreshMs]);

  // Polling for stats (lightweight, always uses simple polling)
  useEffect(() => {
    if (!autoRefresh || tab === "search" || tab === "portfolio" || tab === "watchlist") return;
    const id = setInterval(() => {
      loadStats();
    }, Math.max(refreshMs, 15_000));
    return () => clearInterval(id);
  }, [autoRefresh, tab, loadStats, refreshMs]);

  // Derived: unique DEX options from feed data
  const dexOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of feed?.pairs || []) {
      if (p.dexName) set.add(p.dexName);
    }
    return [...set].sort();
  }, [feed]);

  // Derived: filtered pairs based on filter criteria
  const filtered: TrackedPair[] = useMemo(() => {
    let list = feed?.pairs || [];
    const maxH = maxAgeHours === "" ? null : Number(maxAgeHours);
    const liq = minLiq === "" ? null : Number(minLiq);
    const vol = minVol === "" ? null : Number(minVol);

    if (maxH != null && Number.isFinite(maxH)) {
      const maxMs = maxH * 60 * 60 * 1000;
      list = list.filter((p) => p.ageMs == null || p.ageMs <= maxMs);
    }
    if (liq != null && Number.isFinite(liq)) {
      list = list.filter((p) => (p.liquidityUsd || 0) >= liq);
    }
    if (vol != null && Number.isFinite(vol)) {
      list = list.filter((p) => (p.volume1h || p.volume24h || 0) >= vol);
    }
    if (dexFilter !== "all") {
      list = list.filter((p) => p.dexName === dexFilter);
    }
    return list;
  }, [feed, maxAgeHours, minLiq, minVol, dexFilter]);

  const isSearchTab = tab === "search";
  const isPortfolioTab = tab === "portfolio";
  const isWatchlistTab = tab === "watchlist";
  const isDataTab = !isSearchTab && !isPortfolioTab && !isWatchlistTab;

  // Resolve watchlist items to TrackedPair objects from feed
  const watchlistPairs = useMemo(() => {
    if (!feed?.pairs) return [];
    return watchlistItems
      .map((item) => feed.pairs.find((p) => p.tokenAddress === item.tokenAddress))
      .filter((p): p is TrackedPair => p != null);
  }, [feed, watchlistItems]);

  return (
    <div className="app">
      <ErrorBoundary>
        <Header />
      </ErrorBoundary>

      <div className="container app-body">
        <ErrorBoundary>
          {loading && !feed ? (
            <section className="stats">
              {[1, 2, 3, 4, 5].map((i) => (
                <SkeletonStatCard key={i} />
              ))}
            </section>
          ) : (
            <StatsBar filteredCount={filtered.length} />
          )}
        </ErrorBoundary>

        {!isSearchTab && (
          <ErrorBoundary>
            <Controls
              dexOptions={dexOptions}
              filteredCount={filtered.length}
            />
          </ErrorBoundary>
        )}

        <ErrorBoundary>
          <MetaInfo />
        </ErrorBoundary>

        {error ? <div className="error-box">{error}</div> : null}

        <ErrorBoundary>
          {isPortfolioTab ? (
            <WalletPortfolio onTokenSelect={(addr) => setTab("search")} />
          ) : isWatchlistTab ? (
            <WatchlistPanel
              pairs={watchlistPairs}
              onSelect={setSelected}
              onRemove={removeFromWatchlist}
            />
          ) : loading && !feed ? (
            <SkeletonTable rows={8} />
          ) : (
            <PairTable
              pairs={filtered}
              onSelect={setSelected}
              emptyMessage={
                isSearchTab && !query
                  ? "Type a symbol or address and press Enter to search DexScreener."
                  : "No pairs found. Try widening age/liquidity filters."
              }
            />
          )}
        </ErrorBoundary>

        <Footer />
      </div>

      {selected && (
        <TokenDetailModal pair={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
