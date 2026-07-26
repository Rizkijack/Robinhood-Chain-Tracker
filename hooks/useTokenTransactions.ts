"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { TokenTransaction, TransactionFilter } from "@/lib/types";

const POLLING_INTERVAL = 4000; // 4 seconds
const MAX_TRANSACTIONS = 100;
const WHALE_THRESHOLD = 10000; // $10k
const MEGA_WHALE_THRESHOLD = 50000; // $50k

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

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const transactionsRef = useRef<TokenTransaction[]>([]);
  const isPausedRef = useRef(isPaused);

  // Keep refs in sync
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
      if (tokenPriceUsd != null) params.set("priceUsd", String(tokenPriceUsd));
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

      const newTransactions: TokenTransaction[] = (data.transactions || [])
        .map((tx: any) => normalizeTransaction(tx, tokenAddress))
        .filter((tx: TokenTransaction | null) => tx !== null);

      // Deduplicate: keep only transactions not already in the list
      const existingHashes = new Set(
        transactionsRef.current.map((t) => t.hash)
      );
      const uniqueNew = newTransactions.filter(
        (tx) => !existingHashes.has(tx.hash)
      );

      if (uniqueNew.length > 0) {
        // Add new transactions at the beginning, sort by timestamp descending
        const updated = [...uniqueNew, ...transactionsRef.current]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_TRANSACTIONS);

        setTransactions(updated);
      }

      setLastUpdated(Date.now());
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tokenAddress, pairAddress, tokenPriceUsd, tokenSymbol]);

  const refetch = useCallback(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Start/stop polling based on tokenAddress and pause state
  useEffect(() => {
    if (!tokenAddress || isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchTransactions();

    // Set up polling
    intervalRef.current = setInterval(fetchTransactions, POLLING_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tokenAddress, isPaused, fetchTransactions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
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
 * Normalize raw API transaction data to TokenTransaction interface
 */
function normalizeTransaction(
  raw: any,
  tokenAddress: string
): TokenTransaction | null {
  try {
    const hash = raw.hash || raw.tx_hash || raw.transaction_hash || "";
    if (!hash) return null;

    const type = (raw.type || raw.transaction_type || "buy").toLowerCase() === "sell" ? "sell" : "buy";
    const trader =
      raw.trader || raw.from || raw.sender || raw.wallet_address || "";
    const tokenAmount = parseFloat(
      raw.amount || raw.token_amount || raw.quantity || "0"
    );
    const tokenSymbol =
      raw.token_symbol || raw.symbol || raw.tokenSymbol || "TOKEN";
    const usdValue = parseFloat(
      raw.value_usd || raw.usd_value || raw.price_usd || raw.valueUSD || "0"
    );
    const timestamp = raw.timestamp
      ? typeof raw.timestamp === "string"
        ? new Date(raw.timestamp).getTime()
        : raw.timestamp * 1000
      : Date.now();
    const gasUsed = raw.gas_used || raw.gasUsed;
    const gasFee = raw.gas_fee || raw.gasFee;
    const dexName = raw.dex_name || raw.dex || raw.dexName;
    const blockNumber = raw.block_number || raw.blockNumber;

    const isWhale = usdValue >= WHALE_THRESHOLD;
    const isMegaWhale = usdValue >= MEGA_WHALE_THRESHOLD;

    return {
      hash,
      type,
      trader,
      tokenAmount,
      tokenSymbol,
      usdValue,
      timestamp,
      gasUsed,
      gasFee,
      dexName,
      blockNumber,
      isWhale,
      isMegaWhale,
    };
  } catch (err) {
    console.error("Failed to normalize transaction:", err);
    return null;
  }
}
