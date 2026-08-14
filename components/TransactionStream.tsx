"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import type { TokenTransaction, TransactionFilter } from "@/lib/types";
import { shortAddr, formatUsd, formatPrice, formatAge } from "@/lib/format";
import { blockscoutTxUrl } from "@/lib/sources/blockscout";

interface TransactionStreamProps {
  transactions: TokenTransaction[];
  isLoading: boolean;
  error: string | null;
  isPaused: boolean;
  filter: TransactionFilter;
  onTogglePause: () => void;
  onSetFilter: (filter: Partial<TransactionFilter>) => void;
  onRefetch: () => void;
  tokenSymbol?: string;
  /** Explorer base URL to deep-link each row. Defaults to Blockscout/Robinhood. */
  explorerUrlBuilder?: (hash: string) => string;
}

export function TransactionStream({
  transactions,
  isLoading,
  error,
  isPaused,
  filter,
  onTogglePause,
  onSetFilter,
  onRefetch,
  tokenSymbol = "TOKEN",
  explorerUrlBuilder,
}: TransactionStreamProps) {
  const [flashStates, setFlashStates] = useState<Record<string, boolean>>({});
  const prevTxCountRef = useRef(0);

  // Apply the four filters the user picked.
  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    if (filter.type !== "all") {
      filtered = filtered.filter((tx) => tx.type === filter.type);
    }

    if (filter.timeRange !== "all") {
      const now = Date.now();
      const ranges: Record<string, number> = {
        "15m": 15 * 60 * 1000,
        "1h": 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
      };
      const rangeMs = ranges[filter.timeRange];
      if (rangeMs) {
        filtered = filtered.filter((tx) => now - tx.timestamp <= rangeMs);
      }
    }

    if (filter.minValue > 0) {
      filtered = filtered.filter((tx) => tx.usdValue >= filter.minValue);
    }

    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (tx) =>
          tx.trader.toLowerCase().includes(q) ||
          tx.hash.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [transactions, filter]);

  // Flash new rows on arrival for a moment so the user can spot them.
  useEffect(() => {
    if (
      transactions.length > prevTxCountRef.current &&
      prevTxCountRef.current > 0
    ) {
      const newCount = transactions.length - prevTxCountRef.current;
      const newTxs = transactions.slice(0, newCount);
      const next: Record<string, boolean> = {};
      newTxs.forEach((tx) => {
        next[tx.hash] = true;
      });
      setFlashStates((prev) => ({ ...prev, ...next }));
      const t = setTimeout(() => {
        setFlashStates((prev) => {
          const out = { ...prev };
          newTxs.forEach((tx) => delete out[tx.hash]);
          return out;
        });
      }, 2000);
      prevTxCountRef.current = transactions.length;
      return () => clearTimeout(t);
    }
    prevTxCountRef.current = transactions.length;
  }, [transactions]);

  const linkFor = explorerUrlBuilder ?? blockscoutTxUrl;

  return (
    <section className="transaction-stream">
      <div className="tx-stream-header">
        <div className="tx-stream-title">
          <span className="dsection-title" style={{ margin: 0 }}>
            Live Transactions
          </span>
          {transactions.length > 0 && (
            <span className="tx-count">
              {filteredTransactions.length}/{transactions.length}
            </span>
          )}
        </div>
        <div className="tx-stream-controls">
          <button
            type="button"
            className={`tx-control-btn ${isPaused ? "paused" : ""}`}
            onClick={onTogglePause}
            title={isPaused ? "Resume stream" : "Pause stream"}
          >
            {isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button
            type="button"
            className="tx-control-btn"
            onClick={onRefetch}
            title="Refresh now"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      <div className="tx-filters">
        <div className="tx-filter-group">
          <label>Type</label>
          <select
            value={filter.type}
            onChange={(e) =>
              onSetFilter({ type: e.target.value as TransactionFilter["type"] })
            }
          >
            <option value="all">All</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
            <option value="transfer">Transfer</option>
            <option value="mint">Mint</option>
            <option value="burn">Burn</option>
          </select>
        </div>

        <div className="tx-filter-group">
          <label>Time</label>
          <select
            value={filter.timeRange}
            onChange={(e) =>
              onSetFilter({
                timeRange: e.target.value as TransactionFilter["timeRange"],
              })
            }
          >
            <option value="15m">Last 15m</option>
            <option value="1h">Last 1h</option>
            <option value="24h">Last 24h</option>
            <option value="all">All time</option>
          </select>
        </div>

        <div className="tx-filter-group">
          <label>Min value</label>
          <select
            value={filter.minValue}
            onChange={(e) => onSetFilter({ minValue: Number(e.target.value) })}
          >
            <option value="0">Any size</option>
            <option value="100">≥ $100</option>
            <option value="1000">≥ $1k</option>
            <option value="10000">≥ $10k</option>
            <option value="50000">≥ $50k</option>
          </select>
        </div>

        <div className="tx-filter-group" style={{ flex: 1, minWidth: 140 }}>
          <label>Search</label>
          <input
            type="text"
            placeholder="Wallet or tx hash…"
            value={filter.searchQuery}
            onChange={(e) => onSetFilter({ searchQuery: e.target.value })}
            className="tx-search-input"
          />
        </div>
      </div>

      {/* Column header — the requested Time / Hash / Amount / Gas layout */}
      <div className="tx-cols-header" aria-hidden="true">
        <span className="tx-col-type">Type</span>
        <span className="tx-col-time">Time</span>
        <span className="tx-col-hash">Hash / Wallet</span>
        <span className="tx-col-amount">Amount</span>
        <span className="tx-col-value">Value</span>
        <span className="tx-col-gas">Gas</span>
        <span className="tx-col-link" />
      </div>

      <div className="tx-list">
        {error ? (
          <div className="tx-error">
            Failed to load transactions: {error}
          </div>
        ) : isLoading && transactions.length === 0 ? (
          <div className="tx-loading">
            <div className="spinner" /> Loading transactions from Robinhood
            Explorer…
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="tx-empty">
            {transactions.length === 0
              ? "No transactions yet. Waiting for live data from Robinhood Explorer…"
              : "No transactions match your filters."}
          </div>
        ) : (
          filteredTransactions.map((tx) => (
            <TransactionRow
              key={tx.hash}
              tx={tx}
              isFlashing={Boolean(flashStates[tx.hash])}
              tokenSymbol={tokenSymbol}
              explorerUrl={linkFor(tx.hash)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function TransactionRow({
  tx,
  isFlashing,
  tokenSymbol,
  explorerUrl,
}: {
  tx: TokenTransaction;
  isFlashing: boolean;
  tokenSymbol: string;
  explorerUrl: string;
}) {
  const rowClass = [
    "tx-row",
    `tx-${tx.type}`,
    isFlashing ? "tx-flash" : "",
    tx.isMegaWhale ? "tx-mega-whale" : tx.isWhale ? "tx-whale" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const sign =
    tx.type === "buy"
      ? "+"
      : tx.type === "sell" || tx.type === "burn"
        ? "−" // unicode minus for visual width
        : "↔";

  // Display: "1.23M TOKEN" — never show "0 TOKEN" if the value is actually
  // present but tiny. Cap displayed precision to 6 digits.
  const amountLabel = formatAmount(tx.tokenAmount);
  const valueLabel = tx.usdValue > 0 ? formatUsd(tx.usdValue) : "—";
  const gasLabel = formatGas(tx.gasFee);

  return (
    <div className={rowClass}>
      <span className="tx-col-type">
        <span className={`tx-type-badge tx-type-${tx.type}`}>
          {tx.type === "buy" && "⊕ BUY"}
          {tx.type === "sell" && "⊖ SELL"}
          {tx.type === "transfer" && "↔ TRANSFER"}
          {tx.type === "mint" && "✦ MINT"}
          {tx.type === "burn" && "✦ BURN"}
        </span>
      </span>

      <span className="tx-col-time" title={new Date(tx.timestamp).toISOString()}>
        {formatAge(Date.now() - tx.timestamp)} ago
      </span>

      <span className="tx-col-hash">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="tx-hash-link"
          title={tx.hash}
        >
          {shortAddr(tx.hash, 6, 4)}
        </a>
        <span
          className="tx-trader"
          title={tx.trader}
          onClick={() => navigator.clipboard?.writeText(tx.trader)}
        >
          {shortAddr(tx.trader, 6, 4)}
        </span>
        {tx.isMegaWhale && <span className="whale-tag mega">🐳 Mega</span>}
        {!tx.isMegaWhale && tx.isWhale && (
          <span className="whale-tag">🐋 Whale</span>
        )}
      </span>

      <span className="tx-col-amount" title={String(tx.tokenAmount)}>
        <span className="tx-amount-text">
          {sign} {amountLabel}{" "}
          <span className="muted">{tx.tokenSymbol || tokenSymbol}</span>
        </span>
      </span>

      <span className="tx-col-value">{valueLabel}</span>

      <span className="tx-col-gas" title={tx.gasUsed ? `${tx.gasUsed} gas` : ""}>
        {gasLabel}
      </span>

      <span className="tx-col-link">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="tx-explorer-link"
          title="View on Robinhood Explorer"
        >
          ↗
        </a>
      </span>
    </div>
  );
}

// ── formatters ─────────────────────────────────────────────────────────

function formatAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  if (abs >= 1) return n.toFixed(2);
  if (abs >= 0.0001) return n.toFixed(6);
  return n.toExponential(2);
}

function formatGas(eth: number | undefined): string {
  if (eth == null || !Number.isFinite(eth) || eth <= 0) return "—";
  if (eth < 0.000001) return `${(eth * 1e9).toFixed(2)} gwei`;
  if (eth < 0.001) return `${(eth * 1e6).toFixed(2)} μETH`;
  if (eth < 1) return `${(eth * 1000).toFixed(2)} mETH`;
  return `${eth.toFixed(4)} ETH`;
}
