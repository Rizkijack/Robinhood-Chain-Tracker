"use client";

/**
 * @deprecated Use ConnectWallet component or useConnectedWallet hook instead.
 *
 * This hook is kept as a lightweight Reown-only alternative for contexts that
 * do not use Privy.  For a full unified experience (Privy + Reown), import
 * useConnectedWallet from @/hooks/useConnectedWallet.
 */

import { useCallback } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useReownWallet } from "./PrivyWalletContext";

export const WALLET_EXPLORER_BASE = "https://robinhoodchain.blockscout.com/address/";

export interface WalletState {
  address: string | null;
  via: "reown" | "privy" | null;
  status: "connected" | "disconnected" | "connecting" | "reconnecting";
  connectExternal: () => void;
  disconnect: () => void;
}

/**
 * Lightweight Reown-only wallet hook.
 * Opens the AppKit modal via the safe context wrapper.
 */
export function useWallet(): WalletState {
  const { address, status: wagmiStatus } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const reownWallet = useReownWallet();

  const connectExternal = useCallback(async () => {
    await reownWallet.open();
  }, [reownWallet]);

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
    disconnect,
  };
}
