"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { TokenTransaction, TransactionFilter } from "@/lib/types";

/**
 * Client-side polling hook for the per-token transaction stream.
 *
 * Polls /api/token/{address}/transactions on a fixed cadence. The server-side
 * route is the only source of truth — it pulls from Robinhood Explorer
 * (Blockscout), normalizes everything there, and ships a clean
 * `TokenTransaction[]` to the client. The client just renders.
 *
 * The hook is intentionally dumb: no normalization, no guessing. The
 * server already did the work. Defensive code here only handles null
 * fields that the API may omit (e.g. `usdValue` when the caller didn't
 * pass a price).
 */

const POLLING_INTERVAL = 3_000; // 3s - faster polling for real-time transactions
const MAX_TRANSACTIONS = 100;

interface UseTokenTransactionsReturn {
  transactions: TokenTransaction[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
  isPaused: boolean;
  filter: TransactionFilter;
  togglePause: () => void;
  setFilter: (filter: Partial<TransactionFilter>) => void;
  refetch: () => void;
}

export function useTokenTransactions(
  tokenAddress: string | null,
  pairAddress?: string | null,
  tokenPriceUsd?: number | null,
  tokenSymbol?: string | null
): UseTokenTransactionsReturn {
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilterState] = useState<TransactionFilter>({
    type: "all",
    timeRange: "1h",
    minValue: 0,
    searchQuery: "",
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transactionsRef = useRef<TokenTransaction[]>([]);
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  const setFilter = useCallback((partial: Partial<TransactionFilter>) => {
    setFilterState((prev) => ({ ...prev, ...partial }));
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const fetchTransactions = useCallback(async () => {
    if (!tokenAddress || isPausedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (pairAddress) params.set("pairAddress", pairAddress);
      if (tokenPriceUsd != null && Number.isFinite(tokenPriceUsd)) {
        params.set("priceUsd", String(tokenPriceUsd));
      }
      if (tokenSymbol) params.set("symbol", tokenSymbol);
      const qs = params.toString();
      const response = await fetch(
        `/api/token/${tokenAddress}/transactions${qs ? `?${qs}` : ""}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Sanitize each row before storing. Server already normalized, but
      // be defensive: drop rows with invalid timestamps, cap huge numbers.
      const cleaned: TokenTransaction[] = (data.transactions || [])
        .map((tx: any): TokenTransaction | null => sanitizeRow(tx))
        .filter((tx: TokenTransaction | null): tx is TokenTransaction => tx !== null);

      // Deduplicate against what we already have (server cache may overlap).
      const known = new Set(transactionsRef.current.map((t) => t.hash));
      const fresh = cleaned.filter((tx) => !known.has(tx.hash));

      if (fresh.length > 0) {
        const next = [...fresh, ...transactionsRef.current]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_TRANSACTIONS);
        setTransactions(next);
      } else if (cleaned.length > 0 && transactionsRef.current.length === 0) {
        // First load: even if no new ones, populate if list is empty.
        setTransactions(cleaned.slice(0, MAX_TRANSACTIONS));
      }

      setLastUpdated(Date.now());
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tokenAddress, pairAddress, tokenPriceUsd, tokenSymbol]);

  const refetch = useCallback(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Start/stop polling based on tokenAddress and pause state.
  useEffect(() => {
    if (!tokenAddress || isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    fetchTransactions();
    intervalRef.current = setInterval(fetchTransactions, POLLING_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tokenAddress, isPaused, fetchTransactions]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    transactions,
    isLoading,
    error,
    lastUpdated,
    isPaused,
    filter,
    togglePause,
    setFilter,
    refetch,
  };
}

/**
 * Defensive sanitizer for a single transaction row coming from the API.
 * Returns null if the row is unusable; otherwise returns a fully-typed
 * `TokenTransaction` with every field explicitly set.
 */
function sanitizeRow(raw: any): TokenTransaction | null {
  const hash = String(raw?.hash || "").trim();
  if (!hash) return null;

  // Server returns timestamp in milliseconds. If we somehow get seconds
  // (a 10-digit number), promote to ms. If we get a huge number (>13
  // digits), it's already been doubled — strip a factor of 1000.
  let ts = Number(raw?.timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  if (ts < 1e11) ts = ts * 1000; // seconds → ms
  if (ts > 1e15) ts = ts / 1000; // already-doubled → fix
  // Sanity: clamp to a sane window (between 2020 and 2100).
  if (ts < 1577836800000 || ts > 4102444800000) return null;

  const type = String(raw?.type || "").toLowerCase();
  const safeType: TokenTransaction["type"] =
    type === "sell" || type === "burn" || type === "mint" || type === "transfer"
      ? (type as TokenTransaction["type"])
      : "buy";

  const tokenAmount = Number.isFinite(raw?.tokenAmount) ? Number(raw.tokenAmount) : 0;
  const usdValue = Number.isFinite(raw?.usdValue) ? Number(raw.usdValue) : 0;
  const gasFee = Number.isFinite(raw?.gasFee) ? Number(raw.gasFee) : undefined;

  return {
    hash,
    type: safeType,
    trader: String(raw?.trader || ""),
    tokenAmount,
    tokenSymbol: String(raw?.tokenSymbol || "TOKEN"),
    usdValue,
    timestamp: ts,
    gasUsed: Number.isFinite(raw?.gasUsed) ? Number(raw.gasUsed) : undefined,
    gasFee,
    dexName: raw?.dexName ? String(raw.dexName) : undefined,
    blockNumber: raw?.blockNumber ? String(raw.blockNumber) : undefined,
    isWhale: Boolean(raw?.isWhale) || usdValue >= 10_000,
    isMegaWhale: Boolean(raw?.isMegaWhale) || usdValue >= 50_000,
  };
}
