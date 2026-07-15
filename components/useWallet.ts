"use client";

import { useCallback } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export const WALLET_EXPLORER_BASE = "https://explorer.robinhood.com/address/";

export interface WalletState {
  address: string | null;
  via: "reown" | "privy" | null;
  status: "connected" | "disconnected" | "connecting" | "reconnecting";
  connectExternal: () => void;
  connectSocial: () => void;
  disconnect: () => void;
}

/**
 * Base wallet state backed by wagmi/Reown.
 * Privy hooks must never run without a mounted PrivyProvider, so social login
 * is exposed only after a real Privy integration is configured separately.
 */
export function useWallet(): WalletState {
  const { address, status: wagmiStatus } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();

  const connectExternal = useCallback(async () => {
    try {
      const connector = connectors[0];
      if (connector) await connectAsync({ connector });
    } catch {
      /* user rejected or no connector */
    }
  }, [connectors, connectAsync]);

  const connectSocial = useCallback(() => {
    // Kept in the shared interface; enabled by the Privy-specific integration.
  }, []);

  const disconnect = useCallback(async () => {
    try {
      if (address) await disconnectAsync();
    } catch {
      /* ignore */
    }
  }, [address, disconnectAsync]);

  return {
    address: address ?? null,
    via: address ? "reown" : null,
    status: address
      ? "connected"
      : wagmiStatus === "connecting" || wagmiStatus === "reconnecting"
        ? wagmiStatus
        : "disconnected",
    connectExternal,
    connectSocial,
    disconnect,
  };
}
