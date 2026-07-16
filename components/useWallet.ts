"use client";

import { useCallback, useMemo } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { getActiveWallet } from "@/lib/wallet-service";

export const WALLET_EXPLORER_BASE = "https://explorer.robinhood.com/address/";

export interface WalletState {
  address: string | null;
  via: "reown" | "privy" | null;
  status: "connected" | "disconnected" | "connecting" | "reconnecting";
  walletCount: number;
  connectExternal: () => Promise<void>;
  connectSocial: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Enhanced wallet hook that integrates both Reown providers.
 * Privy integration is handled separately via WalletProviders wrapper.
 */
export function useWallet(): WalletState {
  // Wagmi hooks for Reown
  const { address: wagmiAddress, status: wagmiStatus } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();

  // Get active wallet
  const activeWallet = useMemo(
    () => getActiveWallet(null, wagmiAddress ?? null),
    [wagmiAddress]
  );

  const address = activeWallet?.address ?? null;
  const via = activeWallet?.via ?? null;
  const walletCount = wagmiAddress ? 1 : 0;

  // Determine connection status
  const status: "connected" | "disconnected" | "connecting" | "reconnecting" =
    address
      ? "connected"
      : wagmiStatus === "connecting" || wagmiStatus === "reconnecting"
        ? wagmiStatus
        : "disconnected";

  // Connect via external wallet (Reown/WalletConnect)
  const connectExternal = useCallback(async () => {
    try {
      const connector = connectors[0];
      if (connector) {
        await connectAsync({ connector });
      }
    } catch (error) {
      console.error("[useWallet] External wallet connection failed:", error);
    }
  }, [connectors, connectAsync]);

  // Connect via Privy (email/social)
  const connectSocial = useCallback(async () => {
    console.warn("[useWallet] Privy social login not implemented in this hook. Use PrivyProvider methods instead.");
  }, []);

  // Disconnect
  const disconnect = useCallback(async () => {
    try {
      if (wagmiAddress) {
        await disconnectAsync();
      }
    } catch (error) {
      console.error("[useWallet] Disconnect failed:", error);
    }
  }, [wagmiAddress, disconnectAsync]);

  return {
    address,
    via,
    status,
    walletCount,
    connectExternal,
    connectSocial,
    disconnect,
  };
}
