"use client";

import { useCallback } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { usePrivy, useLogout } from "@privy-io/react-auth";
import { ROBINHOOD_CHAIN_ID_HEX } from "@/lib/chains";

export const WALLET_EXPLORER_BASE = "https://explorer.robinhood.com/address/";

export interface WalletState {
  address: string | null;
  via: "reown" | "privy" | null;
  status: "connected" | "disconnected" | "connecting" | "reconnecting";
  connectExternal: () => void;
  connectSocial: () => void;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const { address, status: wagmiStatus } = useAccount();
  const { connectors, connectAsync, isPending: connectPending } = useConnect();
  const { disconnectAsync: disconnectWagmi } = useDisconnect();

  const privy = usePrivy();
  const privyUser = privy?.user;
  const { logout: privyLogout } = useLogout();

  // Prefer wagmi (Reown) address, fall back to Privy embedded address
  const addressOut = address ?? privyUser?.wallet?.address ?? null;
  const via: WalletState["via"] = address ? "reown" : privyUser ? "privy" : null;
  const status: WalletState["status"] = addressOut
    ? "connected"
    : wagmiStatus === "connecting" || wagmiStatus === "reconnecting"
      ? "reconnecting"
      : "disconnected";

  const connectExternal = useCallback(async () => {
    try {
      if (connectors.length > 0) {
        await connectAsync({ connector: connectors[0] });
      }
    } catch {
      /* user rejected or no connector */
    }
  }, [connectors, connectAsync]);

  const connectSocial = useCallback(async () => {
    try {
      privy.login();
    } catch {
      /* user closed modal */
    }
  }, [privy]);

  const disconnect = useCallback(async () => {
    try {
      if (address) await disconnectWagmi();
      if (privyUser) privyLogout();
    } catch {
      /* ignore */
    }
  }, [address, privyUser, disconnectWagmi, privyLogout]);

  // Suppress unused-var warnings for framework hooks that are informational
  void connectPending;
  void ROBINHOOD_CHAIN_ID_HEX;

  return {
    address: addressOut ?? null,
    via,
    status,
    connectExternal,
    connectSocial,
    disconnect,
  };
}
