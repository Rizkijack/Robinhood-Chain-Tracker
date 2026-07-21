"use client";

/**
 * Unified wallet hook that reads from both Privy and wagmi/Reown.
 * This ensures the connected wallet address is available regardless
 * of which provider the user used to connect.
 */

import { useAccount } from "wagmi";
import { usePrivy as _usePrivy, useWallets as _useWallets } from "@privy-io/react-auth";

const PRIVY_ENABLED = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export interface ConnectedWallet {
  address: string | null;
  /** Which provider the wallet came from */
  via: "privy" | "reown" | null;
  /** Whether any wallet is connected */
  isConnected: boolean;
}

/**
 * Returns the connected wallet address from either Privy or wagmi/Reown.
 * Privy wallets take priority (since embedded wallets are more common).
 */
export function useConnectedWallet(): ConnectedWallet {
  // Wagmi (Reown)
  const { address: wagmiAddress } = useAccount();

  // Privy — only call hooks when PrivyProvider is mounted
  let privyAddress: string | null = null;
  if (PRIVY_ENABLED) {
    try {
      const privy = _usePrivy();
      const { wallets } = _useWallets();
      if (privy.authenticated && wallets?.length > 0) {
        privyAddress = wallets[0].address;
      }
    } catch {
      // Privy provider not mounted or not ready
    }
  }

  const address = privyAddress || wagmiAddress || null;
  const via = privyAddress ? "privy" : wagmiAddress ? "reown" : null;

  return {
    address,
    via,
    isConnected: !!address,
  };
}
