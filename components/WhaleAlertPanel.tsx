"use client";

import { useState, useMemo } from "react";
import type { WhaleTransaction } from "@/lib/types";
import { formatUsd, formatAge, shortAddr } from "@/lib/format";

interface WhaleAlertPanelProps {
  whales: WhaleTransaction[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectToken?: (address: string) => void;
}

export function WhaleAlertPanel({
  whales,
  isLoading,
  error,
  onRefresh,
  onSelectToken,
}: WhaleAlertPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<"all" | "buy" | "sell" | "transfer">("all");

  const filtered = useMemo(() => {
    if (filter === "all") return whales;
    return whales.filter((w) => w.type === filter);
  }, [whales, filter]);

  const displayWhales = expanded ? filtered : filtered.slice(0, 5);

  const totalVolume = useMemo(
    () => whales.reduce((sum, w) => sum + w.usdValue, 0),
    [whales]
  );

  return (
    <div className="whale-panel">
      <div className="whale-panel-header">
        <div className="whale-panel-title">
          <span className="whale-icon">🐋</span>
          <span>Whale Alerts</span>
          {whales.length > 0 && (
            <span className="whale-count">{whales.length}</span>
          )}
        </div>
        <div className="whale-panel-meta">
          <span className="whale-volume">
            {formatUsd(totalVolume)} total
          </span>
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

      <div className="whale-filters">
        {(["all", "buy", "sell", "transfer"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`whale-filter-btn ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "buy" ? "⊕ Buy" : f === "sell" ? "⊖ Sell" : "↔ Transfer"}
          </button>
        ))}
      </div>

      {error ? (
        <div className="whale-error">{error}</div>
      ) : displayWhales.length === 0 ? (
        <div className="whale-empty">
          {isLoading ? "Scanning for whale activity…" : "No whale transactions detected"}
        </div>
      ) : (
        <div className="whale-list">
          {displayWhales.map((tx) => (
            <WhaleRow key={tx.hash} tx={tx} onSelectToken={onSelectToken} />
          ))}
        </div>
      )}

      {filtered.length > 5 && (
        <button
          type="button"
          className="whale-expand"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  );
}

function WhaleRow({
  tx,
  onSelectToken,
}: {
  tx: WhaleTransaction;
  onSelectToken?: (address: string) => void;
}) {
  const typeClass =
    tx.type === "buy"
      ? "whale-type-buy"
      : tx.type === "sell"
        ? "whale-type-sell"
        : tx.type === "mint"
          ? "whale-type-mint"
          : "whale-type-transfer";

  const sign =
    tx.type === "buy"
      ? "+"
      : tx.type === "sell" || tx.type === "burn"
        ? "−"
        : "↔";

  return (
    <div className={`whale-row ${typeClass}`}>
      <div className="whale-row-left">
        <span className={`whale-type ${typeClass}`}>
          {tx.type === "buy" ? "⊕" : tx.type === "sell" ? "⊖" : "↔"}
        </span>
        <div className="whale-row-info">
          <div className="whale-row-token">
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
          </div>
          <div className="whale-row-meta">
            <span className="whale-trader">{shortAddr(tx.trader, 6, 4)}</span>
            <span className="whale-time">{formatAge(Date.now() - tx.timestamp)} ago</span>
          </div>
        </div>
      </div>
      <div className="whale-row-right">
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
