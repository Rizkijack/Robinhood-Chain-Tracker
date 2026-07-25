"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import type { TokenTransaction, TransactionFilter } from "@/lib/types";
import { shortAddr, formatUsd, formatPrice } from "@/lib/format";

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
}: TransactionStreamProps) {
  const [flashStates, setFlashStates] = useState<Record<string, boolean>>({});
  const prevTxCountRef = useRef(0);

  // Filter transactions based on current filter
  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    // Filter by type
    if (filter.type !== "all") {
      filtered = filtered.filter((tx) => tx.type === filter.type);
    }

    // Filter by time range
    if (filter.timeRange !== "all") {
      const now = Date.now();
      const timeRanges = {
        "15m": 15 * 60 * 1000,
        "1h": 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
      };
      const rangeMs = timeRanges[filter.timeRange as keyof typeof timeRanges];
      filtered = filtered.filter((tx) => now - tx.timestamp <= rangeMs);
    }

    // Filter by minimum value
    if (filter.minValue > 0) {
      filtered = filtered.filter((tx) => tx.usdValue >= filter.minValue);
    }

    // Filter by search query (wallet address)
    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (tx) =>
          tx.trader.toLowerCase().includes(query) ||
          tx.hash.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [transactions, filter]);

  // Flash new transactions
  useEffect(() => {
    if (transactions.length > prevTxCountRef.current && prevTxCountRef.current > 0) {
      const newTxCount = transactions.length - prevTxCountRef.current;
      const newTxs = transactions.slice(0, newTxCount);
      const newFlashStates: Record<string, boolean> = {};
      newTxs.forEach((tx) => {
        newFlashStates[tx.hash] = true;
      });

      setFlashStates((prev) => ({ ...prev, ...newFlashStates }));

      // Remove flash after 2 seconds
      setTimeout(() => {
        setFlashStates((prev) => {
          const updated = { ...prev };
          newTxs.forEach((tx) => {
            delete updated[tx.hash];
          });
          return updated;
        });
      }, 2000);
    }
    prevTxCountRef.current = transactions.length;
  }, [transactions]);

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <section className="transaction-stream">
      <div className="dsection-title">
        Live Transaction Stream
        {transactions.length > 0 && (
          <span className="tx-count">{filteredTransactions.length} txns</span>
        )}
      </div>

      {/* Controls */}
      <div className="tx-controls">
        <div className="tx-filter-group">
          <select
            value={filter.type}
            onChange={(e) =>
              onSetFilter({ type: e.target.value as TransactionFilter["type"] })
            }
            className="tx-select"
          >
            <option value="all">All</option>
            <option value="buy">Buy only</option>
            <option value="sell">Sell only</option>
          </select>

          <select
            value={filter.timeRange}
            onChange={(e) =>
              onSetFilter({
                timeRange: e.target.value as TransactionFilter["timeRange"],
              })
            }
            className="tx-select"
          >
            <option value="15m">Last 15m</option>
            <option value="1h">Last 1h</option>
            <option value="24h">Last 24h</option>
            <option value="all">All time</option>
          </select>

          <select
            value={filter.minValue}
            onChange={(e) =>
              onSetFilter({ minValue: Number(e.target.value) })
            }
            className="tx-select"
          >
            <option value="0">Any size</option>
            <option value="1000">Min $1k</option>
            <option value="10000">Min $10k</option>
            <option value="100000">Min $100k</option>
          </select>
        </div>

        <div className="tx-actions">
          <button
            type="button"
            className={`tx-pause-btn ${isPaused ? "paused" : ""}`}
            onClick={onTogglePause}
            title={isPaused ? "Resume stream" : "Pause stream"}
          >
            {isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button
            type="button"
            className="tx-refresh-btn"
            onClick={onRefetch}
            title="Refresh now"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="tx-search">
        <input
          type="text"
          placeholder="Search by wallet address..."
          value={filter.searchQuery}
          onChange={(e) => onSetFilter({ searchQuery: e.target.value })}
          className="tx-search-input"
        />
      </div>

      {/* Transaction List */}
      <div className="tx-list">
        {error ? (
          <div className="tx-error">Error: {error}</div>
        ) : isLoading && transactions.length === 0 ? (
          <div className="tx-loading">
            <div className="spinner" /> Loading transactions...
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="tx-empty">
            {transactions.length === 0
              ? "No transactions yet. Waiting for live data..."
              : "No transactions match your filters."}
          </div>
        ) : (
          filteredTransactions.map((tx) => (
            <TransactionRow
              key={tx.hash}
              tx={tx}
              isFlashing={flashStates[tx.hash]}
              tokenSymbol={tokenSymbol}
              formatTimeAgo={formatTimeAgo}
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
  formatTimeAgo,
}: {
  tx: TokenTransaction;
  isFlashing: boolean;
  tokenSymbol: string;
  formatTimeAgo: (timestamp: number) => string;
}) {
  const rowClass = [
    "tx-row",
    tx.type,
    isFlashing ? "flash" : "",
    tx.isMegaWhale ? "mega-whale" : tx.isWhale ? "whale" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rowClass}>
      <div className="tx-type-badge">
        {tx.type === "buy" ? "⊕ BUY" : "⊖ SELL"}
      </div>

      <div className="tx-main">
        <div className="tx-header">
          <span
            className="tx-trader"
            title={tx.trader}
            onClick={() => navigator.clipboard.writeText(tx.trader)}
          >
            {shortAddr(tx.trader, 6, 4)}
          </span>
          <span className="tx-time">{formatTimeAgo(tx.timestamp)}</span>
        </div>

        <div className="tx-details">
          <span className="tx-amount">
            {tx.type === "buy" ? "+" : "-"}
            {formatPrice(tx.tokenAmount)} {tx.tokenSymbol}
          </span>
          <span className="tx-value">(${formatUsd(tx.usdValue)})</span>
        </div>

        {(tx.gasFee || tx.dexName) && (
          <div className="tx-meta">
            {tx.dexName && <span className="tx-dex">{tx.dexName}</span>}
            {tx.gasFee && (
              <span className="tx-gas">
                Gas: {formatPrice(tx.gasFee)} ETH
              </span>
            )}
          </div>
        )}

        {tx.isMegaWhale && (
          <span className="whale-tag mega">🐳 Mega Whale</span>
        )}
        {!tx.isMegaWhale && tx.isWhale && (
          <span className="whale-tag">🐋 Whale</span>
        )}
      </div>

      <div className="tx-actions">
        <a
          href={`https://explorer.robinhoodchain.com/tx/${tx.hash}`}
          target="_blank"
          rel="noreferrer"
          className="tx-explorer-link"
          title="View on explorer"
        >
          🔗
        </a>
      </div>
    </div>
  );
}
