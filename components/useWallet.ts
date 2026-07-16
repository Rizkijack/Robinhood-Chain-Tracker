"use client";

import { useCallback, useMemo } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { getActiveWallet } from "@/lib/wallet-service";

// Privy hooks - conditionally imported to avoid SSR issues
let usePrivy: any = () => ({ authenticated: false });
let useWallets: any = () => ({ wallets: [] });

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
  try {
    const privyModule = require("@privy-io/react-auth");
    usePrivy = privyModule.usePrivy;
    useWallets = privyModule.useWallets;
  } catch {
    // Privy not available
  }
}

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
 * Enhanced wallet hook that integrates both Privy and Reown providers.
 * Automatically detects which provider is active and manages connection state.
 */
export function useWallet(): WalletState {
  // Wagmi hooks for Reown
  const { address: wagmiAddress, status: wagmiStatus } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();

  // Privy hooks (if configured)
  const { authenticated: privyAuthenticated, login: privyLogin, logout: privyLogout } =
    usePrivy();
  const { wallets: privyWallets } = useWallets();

  // Determine active wallet and provider
  const privyAddress = privyAuthenticated && privyWallets.length > 0 
    ? privyWallets[0].address 
    : null;

  const activeWallet = useMemo(
    () => getActiveWallet(privyAddress, wagmiAddress ?? null),
    [privyAddress, wagmiAddress]
  );

  const address = activeWallet?.address ?? null;
  const via = activeWallet?.via ?? null;
  const walletCount = (privyWallets?.length ?? 0) + (wagmiAddress ? 1 : 0);

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
    try {
      if (privyLogin) {
        await privyLogin();
      } else {
        console.warn("[useWallet] Privy login not available");
      }
    } catch (error) {
      console.error("[useWallet] Privy login failed:", error);
    }
  }, [privyLogin]);

  // Disconnect
  const disconnect = useCallback(async () => {
    try {
      if (privyAddress && privyLogout) {
        await privyLogout();
      } else if (wagmiAddress) {
        await disconnectAsync();
      }
    } catch (error) {
      console.error("[useWallet] Disconnect failed:", error);
    }
  }, [privyAddress, privyLogout, wagmiAddress, disconnectAsync]);

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
