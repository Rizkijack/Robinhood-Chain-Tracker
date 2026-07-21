"use client";

import { useCallback } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export const WALLET_EXPLORER_BASE = "https://robinhoodchain.blockscout.com/address/";

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
    // Check if we're in a Privy-enabled environment
    const isPrivyEnabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
    
    if (isPrivyEnabled) {
      // Try to trigger Privy login
      // This will be handled by the actual Privy implementation
      console.log("Privy login triggered - needs implementation");
      // For now, show a message
      alert("Privy login is configured but not fully implemented. Please check the console for details.");
    } else {
      console.warn("Privy is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID to enable social login.");
    }
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
