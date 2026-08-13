"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { TrackedPair } from "@/lib/types";
import { REFRESH_MS } from "@/lib/constants";
import { useFeedStore, useFilterStore, useUiStore } from "@/lib/store";
import { useNotifications } from "@/hooks/useNotifications";
import { useWhaleAlerts } from "@/hooks/useWhaleAlerts";
import { usePriceAlerts } from "@/hooks/usePriceAlerts";
import { useEntityActivity } from "@/components/EntityHeatmap";
import { generateMockSentiment } from "@/components/SocialSentiment";
import { ErrorBoundary } from "./ErrorBoundary";
import { SkeletonTable, SkeletonStatCard } from "./Skeleton";
import { Header } from "./Header";
import { StatsBar } from "./StatsBar";
import { Controls } from "./Controls";
import { MetaInfo } from "./MetaInfo";
import { Footer } from "./Footer";
import { PairTable } from "./PairTable";
import { ToastContainer } from "./ToastContainer";
import { useWatchlist } from "./Watchlist";
import { WhaleAlertPanel } from "./WhaleAlertPanel";
import { EntityHeatmap } from "./EntityHeatmap";
import { SocialSentiment } from "./SocialSentiment";
import { DefiLlamaOverview } from "./DefiLlamaOverview";
import { AdvancedFilters, applyAdvancedFilters, DEFAULT_FILTER } from "./AdvancedFilters";
import type { AdvancedFilter } from "./AdvancedFilters";

// Lazy-load heavy components
const WhaleDashboard = dynamic(
  () => import("./WhaleDashboard").then((m) => m.WhaleDashboard),
  { ssr: false }
);
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
const TokenComparison = dynamic(
  () => import("./TokenComparison").then((m) => m.TokenComparison),
  { ssr: false }
);
const AiTokenSummary = dynamic(
  () => import("./AiTokenSummary").then((m) => m.AiTokenSummary),
  { ssr: false }
);

export function TrackerApp() {
  const { feed, loading, error, loadFeed, loadStats } = useFeedStore();
  const { tab, query, maxAgeHours, minLiq, minVol, dexFilter, setTab } = useFilterStore();
  const { autoRefresh, selected, setSelected } = useUiStore();
  const { items: watchlistItems, remove: removeFromWatchlist } = useWatchlist();

  // Feature hooks
  const { whales, isLoading: whalesLoading, error: whaleError, refetch: refetchWhales } = useWhaleAlerts();
  const { alerts: priceAlerts, dismissAlert } = usePriceAlerts();
  const { entities, isLoading: entitiesLoading } = useEntityActivity();
  const sentimentItems = useMemo(() => generateMockSentiment(), []);

  // Advanced filters state
  const [advFilter, setAdvFilter] = useState<AdvancedFilter>(DEFAULT_FILTER);
  const [advOpen, setAdvOpen] = useState(false);

  // Token comparison state
  const [compareTokens, setCompareTokens] = useState<TrackedPair[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const addToCompare = useCallback((pair: TrackedPair) => {
    setCompareTokens((prev) => {
      if (prev.length >= 4) return prev;
      if (prev.some((t) => t.pairAddress === pair.pairAddress)) return prev;
      return [...prev, pair];
    });
    setShowCompare(true);
  }, []);

  const removeFromCompare = useCallback((index: number) => {
    setCompareTokens((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length < 2) setShowCompare(false);
      return next;
    });
  }, []);

  // Notification hook — watches feed changes and fires alerts
  useNotifications();

  // Load initial data on mount and when tab/query changes
  useEffect(() => {
    if (tab === "portfolio" || tab === "watchlist" || tab === "whales") return;
    loadStats();
    loadFeed(tab, query);
  }, [loadFeed, loadStats, tab, query]);

  const refreshMs = feed?.recommendedRefreshMs ?? REFRESH_MS;

  // Polling for feed data
  useEffect(() => {
    if (tab === "search" || tab === "portfolio" || tab === "watchlist" || tab === "whales" || !autoRefresh) return;
    const id = setInterval(() => {
      loadFeed(tab, query);
    }, refreshMs);
    return () => clearInterval(id);
  }, [autoRefresh, tab, loadFeed, refreshMs]);

  // Polling for stats
  useEffect(() => {
    if (!autoRefresh || tab === "search" || tab === "portfolio" || tab === "watchlist" || tab === "whales") return;
    const id = setInterval(() => {
      loadStats();
    }, Math.max(refreshMs, 15_000));
    return () => clearInterval(id);
  }, [autoRefresh, tab, loadStats, refreshMs]);

  const dexOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of feed?.pairs || []) {
      if (p.dexName) set.add(p.dexName);
    }
    return [...set].sort();
  }, [feed]);

  // Derived: filtered pairs (basic + advanced filters)
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

    // Apply advanced filters
    list = applyAdvancedFilters(list, advFilter);

    return list;
  }, [feed, maxAgeHours, minLiq, minVol, dexFilter, advFilter]);

  const isSearchTab = tab === "search";
  const isPortfolioTab = tab === "portfolio";
  const isWatchlistTab = tab === "watchlist";
  const isWhaleTab = tab === "whales";
  const isDataTab = !isSearchTab && !isPortfolioTab && !isWatchlistTab && !isWhaleTab;

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

        {/* Price Alert Banners */}
        {priceAlerts.length > 0 && (
          <div style={{ marginBottom: "var(--sp-3)" }}>
            {priceAlerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className="price-alert-bar">
                <span className="price-alert-icon">🔔</span>
                <span className="price-alert-text">{alert.message}</span>
                <button
                  type="button"
                  className="price-alert-dismiss"
                  onClick={() => dismissAlert(alert.id)}
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Whale Alert Panel */}
        {isDataTab && (
          <ErrorBoundary>
            <WhaleAlertPanel
              whales={whales}
              isLoading={whalesLoading}
              error={whaleError}
              onRefresh={refetchWhales}
            />
          </ErrorBoundary>
        )}

        {/* AI Token Summary for selected token */}
        {selected && (
          <ErrorBoundary>
            <AiTokenSummary pair={selected} />
          </ErrorBoundary>
        )}

        {/* Token Comparison */}
        {showCompare && compareTokens.length >= 2 && (
          <ErrorBoundary>
            <TokenComparison
              tokens={compareTokens}
              onRemove={removeFromCompare}
              onAdd={() => setSelected(feed?.pairs[0] ?? null)}
              onClose={() => setShowCompare(false)}
            />
          </ErrorBoundary>
        )}

        {!isSearchTab && (
          <ErrorBoundary>
            <Controls
              dexOptions={dexOptions}
              filteredCount={filtered.length}
            />
          </ErrorBoundary>
        )}

        {/* Advanced Filters */}
        {isDataTab && (
          <AdvancedFilters
            filter={advFilter}
            onChange={setAdvFilter}
            isOpen={advOpen}
            onToggle={() => setAdvOpen(!advOpen)}
          />
        )}

        <ErrorBoundary>
          <MetaInfo />
        </ErrorBoundary>

        {error ? <div className="error-box">{error}</div> : null}

        <ErrorBoundary>
          {isWhaleTab ? (
            <WhaleDashboard />
          ) : isPortfolioTab ? (
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

        {/* DefiLlama Overview */}
        {isDataTab && (
          <ErrorBoundary>
            <DefiLlamaOverview />
          </ErrorBoundary>
        )}

        {/* Bottom panels: Entity Heatmap + Social Sentiment */}
        {isDataTab && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)", marginTop: "var(--sp-4)" }}>
            <ErrorBoundary>
              <EntityHeatmap entities={entities} isLoading={entitiesLoading} />
            </ErrorBoundary>
            <ErrorBoundary>
              <SocialSentiment items={sentimentItems} />
            </ErrorBoundary>
          </div>
        )}

        <Footer />
      </div>

      {selected && (
        <TokenDetailModal pair={selected} onClose={() => setSelected(null)} />
      )}

      <ToastContainer />
    </div>
  );
}
