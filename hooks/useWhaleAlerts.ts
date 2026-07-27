"use client";

import { useEffect, useState, useCallback, useRef } from "react";

export interface WhaleTransaction {
  hash: string;
  type: string;
  trader: string;
  tokenSymbol: string;
  tokenAddress: string;
  usdValue: number;
  tokenAmount: number;
  timestamp: number;
  entity: string | null;
  entityLogo: string | null;
  chain: string;
}

interface UseWhaleAlertsReturn {
  whales: WhaleTransaction[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const POLL_INTERVAL = 15_000; // 15s

export function useWhaleAlerts(): UseWhaleAlertsReturn {
  const [whales, setWhales] = useState<WhaleTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWhales = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/whales");
      const data = await res.json();
      if (data.error && !data.transactions?.length) {
        setError(data.error);
      } else {
        setError(null);
        setWhales(data.transactions || []);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refetch = useCallback(() => {
    fetchWhales();
  }, [fetchWhales]);

  useEffect(() => {
    fetchWhales();
    intervalRef.current = setInterval(fetchWhales, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchWhales]);

  return { whales, isLoading, error, refetch };
}
