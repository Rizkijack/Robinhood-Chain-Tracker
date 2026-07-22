"use client";

/**
 * Unified wallet hook that reads from both Privy and wagmi/Reown.
 * Ensures the connected wallet address is available regardless
 * of which provider the user used to connect.
 *
 * Privy state is read via usePrivyWallet() — a context hook with a
 * safe default (disconnected) when PrivyProvider is not mounted.
 * This avoids calling usePrivy/useWallets outside <PrivyProvider>,
 * which would violate Rules of Hooks and crash the app.
 */

import { useAccount } from "wagmi";
import { usePrivyWallet } from "@/components/PrivyWalletContext";

const PRIVY_ENABLED = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export interface ConnectedWallet {
  address: string | null;
  via: "privy" | "reown" | null;
  isConnected: boolean;
}

/**
 * Returns the connected wallet address from either Privy or wagmi/Reown.
 * Privy wallets take priority (embedded wallets are more common here).
 *
 * usePrivyWallet() is always safe to call — it returns a disconnected
 * default when PrivyProvider is not mounted.
 */
export function useConnectedWallet(): ConnectedWallet {
  const { address: wagmiAddress } = useAccount();
  const privyWallet = usePrivyWallet();

  const privyAddress = PRIVY_ENABLED ? privyWallet.address : null;

  const address = privyAddress || wagmiAddress || null;
  const via = privyAddress ? "privy" : wagmiAddress ? "reown" : null;

  return {
    address,
    via,
    isConnected: !!address,
  };
}
