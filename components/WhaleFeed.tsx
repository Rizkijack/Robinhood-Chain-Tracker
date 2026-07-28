"use client";

import { useState, useMemo, useCallback } from "react";
import { formatUsd, formatAge, shortAddr } from "@/lib/format";
import type { WhaleTransaction } from "@/lib/types";

interface WhaleFeedProps {
  transactions: WhaleTransaction[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectEntity?: (name: string) => void;
  onSelectToken?: (address: string) => void;
}

type FilterType = "all" | "buy" | "sell" | "transfer" | "mint" | "burn";
type SortBy = "time" | "value";

const USD_TIERS = [
  { label: "All", min: 0 },
  { label: "$10K+", min: 10_000 },
  { label: "$50K+", min: 50_000 },
  { label: "$100K+", min: 100_000 },
  { label: "$500K+", min: 500_000 },
];

export function WhaleFeed({
  transactions,
  isLoading,
  error,
  onRefresh,
  onSelectEntity,
  onSelectToken,
}: WhaleFeedProps) {
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [usdTier, setUsdTier] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>("time");
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    let list = transactions;

    if (typeFilter !== "all") {
      list = list.filter((tx) => tx.type === typeFilter);
    }

    if (usdTier > 0) {
      list = list.filter((tx) => tx.usdValue >= usdTier);
    }

    if (sortBy === "value") {
      list = [...list].sort((a, b) => b.usdValue - a.usdValue);
    }

    return list;
  }, [transactions, typeFilter, usdTier, sortBy]);

  const displayList = expanded ? filtered : filtered.slice(0, 20);

  const totalVolume = useMemo(
    () => filtered.reduce((sum, tx) => sum + tx.usdValue, 0),
    [filtered]
  );

  return (
    <div className="whale-feed">
      <div className="whale-feed-header">
        <div className="whale-feed-title">
          <span>🐋</span>
          <span>Whale Feed</span>
          {filtered.length > 0 && (
            <span className="whale-feed-count">{filtered.length}</span>
          )}
        </div>
        <div className="whale-feed-meta">
          <span className="whale-feed-volume">{formatUsd(totalVolume)}</span>
          <button
            type="button"
            className="whale-refresh"
            onClick={onRefresh}
            disabled={isLoading}
          >
            {isLoading ? "⟳" : "↻"}
          </button>
        </div>
      </div>

      {/* Type filters */}
      <div className="whale-feed-filters">
        {(["all", "buy", "sell", "transfer"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`whale-filter-chip ${typeFilter === f ? "active" : ""}`}
            onClick={() => setTypeFilter(f)}
          >
            {f === "all" ? "All" : f === "buy" ? "⊕ Buy" : f === "sell" ? "⊖ Sell" : "↔ Transfer"}
          </button>
        ))}
      </div>

      {/* USD tier + sort */}
      <div className="whale-feed-controls">
        <div className="whale-usd-tiers">
          {USD_TIERS.map((tier) => (
            <button
              key={tier.min}
              type="button"
              className={`whale-tier-btn ${usdTier === tier.min ? "active" : ""}`}
              onClick={() => setUsdTier(tier.min)}
            >
              {tier.label}
            </button>
          ))}
        </div>
        <div className="whale-sort">
          <button
            type="button"
            className={`whale-sort-btn ${sortBy === "time" ? "active" : ""}`}
            onClick={() => setSortBy("time")}
          >
            Time
          </button>
          <button
            type="button"
            className={`whale-sort-btn ${sortBy === "value" ? "active" : ""}`}
            onClick={() => setSortBy("value")}
          >
            Value
          </button>
        </div>
      </div>

      {error ? (
        <div className="whale-feed-error">{error}</div>
      ) : displayList.length === 0 ? (
        <div className="whale-feed-empty">
          {isLoading ? "Scanning for whale activity…" : "No whale transactions detected"}
        </div>
      ) : (
        <div className="whale-feed-list">
          {displayList.map((tx) => (
            <WhaleFeedRow
              key={tx.hash}
              tx={tx}
              onSelectEntity={onSelectEntity}
              onSelectToken={onSelectToken}
            />
          ))}
        </div>
      )}

      {filtered.length > 20 && (
        <button
          type="button"
          className="whale-feed-expand"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  );
}

function WhaleFeedRow({
  tx,
  onSelectEntity,
  onSelectToken,
}: {
  tx: WhaleTransaction;
  onSelectEntity?: (name: string) => void;
  onSelectToken?: (address: string) => void;
}) {
  const typeClass =
    tx.type === "buy" ? "whale-type-buy" :
    tx.type === "sell" ? "whale-type-sell" :
    tx.type === "mint" ? "whale-type-mint" :
    "whale-type-transfer";

  const sign = tx.type === "buy" ? "+" : tx.type === "sell" ? "−" : "↔";
  const icon = tx.type === "buy" ? "⊕" : tx.type === "sell" ? "⊖" : "↔";

  const isMega = tx.usdValue >= 50_000;
  const isUltra = tx.usdValue >= 500_000;

  return (
    <div className={`whale-feed-row ${typeClass} ${isUltra ? "whale-ultra" : isMega ? "whale-mega" : ""}`}>
      <div className="whale-feed-row-left">
        <span className={`whale-type ${typeClass}`}>{icon}</span>
        <div className="whale-feed-row-info">
          <div className="whale-feed-row-token">
            <span
              className="whale-token-sym"
              onClick={() => tx.tokenAddress && onSelectToken?.(tx.tokenAddress)}
              role={onSelectToken ? "button" : undefined}
            >
              {tx.tokenSymbol}
            </span>
            <span className="whale-row-amount">
              {sign} {formatTokenAmount(tx.tokenAmount)}
            </span>
            {isUltra && <span className="whale-badge-ultra">🐋</span>}
            {isMega && !isUltra && <span className="whale-badge-mega">🐳</span>}
          </div>
          <div className="whale-feed-row-meta">
            {tx.entity ? (
              <span
                className="whale-entity clickable"
                onClick={() => onSelectEntity?.(tx.entity!)}
                role="button"
              >
                {tx.entityLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tx.entityLogo} alt="" width={12} height={12} />
                )}
                {tx.entity}
              </span>
            ) : (
              <span className="whale-trader">{shortAddr(tx.trader, 6, 4)}</span>
            )}
            <span className="whale-time">{formatAge(Date.now() - tx.timestamp)} ago</span>
          </div>
        </div>
      </div>
      <div className="whale-feed-row-right">
        <span className="whale-usd">{formatUsd(tx.usdValue)}</span>
      </div>
    </div>
  );
}

function formatTokenAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  if (abs >= 1) return n.toFixed(2);
  return n.toExponential(2);
}
