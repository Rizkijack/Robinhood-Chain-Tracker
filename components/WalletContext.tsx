"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useConfig } from "wagmi";
import { useWallet } from "./useWallet";
import { fetchWalletBalance } from "@/lib/wallet-service";
import type { WalletBalance } from "@/lib/wallet-service";

interface WalletContextType {
  address: string | null;
  via: "reown" | "privy" | null;
  status: "connected" | "disconnected" | "connecting" | "reconnecting";
  walletCount: number;
  balance: WalletBalance | null;
  balanceLoading: boolean;
  balanceError: string | null;
  connectExternal: () => Promise<void>;
  connectSocial: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const WalletContextImpl = createContext<WalletContextType | undefined>(undefined);

export function WalletContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const wallet = useWallet();
  const wagmiConfig = useConfig();
  
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // Fetch balance when wallet changes
  useEffect(() => {
    if (!wallet.address) {
      setBalance(null);
      setBalanceError(null);
      return;
    }

    const fetchBalance = async () => {
      setBalanceLoading(true);
      setBalanceError(null);
      try {
        if (!wallet.address) return;
        const result = await fetchWalletBalance(wallet.address, wagmiConfig);
        if (result) {
          setBalance(result);
        } else {
          setBalanceError("Failed to fetch balance");
        }
      } catch (error) {
        console.error("[WalletContext] Balance fetch error:", error);
        setBalanceError(error instanceof Error ? error.message : "Unknown error");
      } finally {
        setBalanceLoading(false);
      }
    };

    fetchBalance();
    // Optional: Set up auto-refresh every 10 seconds
    const interval = setInterval(fetchBalance, 10_000);
    return () => clearInterval(interval);
  }, [wallet.address, wagmiConfig]);

  const refreshBalance = async () => {
    if (!wallet.address) return;
    setBalanceLoading(true);
    try {
      const result = await fetchWalletBalance(wallet.address, wagmiConfig);
      if (result) {
        setBalance(result);
      }
    } catch (error) {
      console.error("[WalletContext] Manual balance refresh failed:", error);
    } finally {
      setBalanceLoading(false);
    }
  };

  const value: WalletContextType = useMemo(
    () => ({
      address: wallet.address,
      via: wallet.via,
      status: wallet.status,
      walletCount: wallet.walletCount,
      balance,
      balanceLoading,
      balanceError,
      connectExternal: wallet.connectExternal,
      connectSocial: wallet.connectSocial,
      disconnect: wallet.disconnect,
      refreshBalance,
    }),
    [wallet, balance, balanceLoading, balanceError]
  );

  return (
    <WalletContextImpl.Provider value={value}>
      {children}
    </WalletContextImpl.Provider>
  );
}

/**
 * Hook to access wallet context.
 * Must be used within WalletContextProvider.
 */
export function useWalletContext(): WalletContextType {
  const context = useContext(WalletContextImpl);
  if (!context) {
    throw new Error(
      "useWalletContext must be used within WalletContextProvider"
    );
  }
  return context;
}

/**
 * Hook to access only wallet balance.
 * Useful for components that only need balance data.
 */
export function useWalletBalance() {
  const { balance, balanceLoading, balanceError, refreshBalance } =
    useWalletContext();
  return { balance, balanceLoading, balanceError, refreshBalance };
}

/**
 * Hook to access wallet connection state.
 */
export function useWalletConnection() {
  const { address, via, status, walletCount } = useWalletContext();
  return { address, via, status, walletCount };
}
