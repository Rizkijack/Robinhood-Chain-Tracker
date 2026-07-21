"use client";

/**
 * Unified wallet hook that reads from both Privy and wagmi/Reown.
 * Ensures the connected wallet address is available regardless
 * of which provider the user used to connect.
 *
 * ⚠️ Privy hooks (usePrivy, useWallets) MUST NOT be called unless
 * <PrivyProvider> is mounted in the tree. WalletProviders only mounts
 * PrivyProvider when NEXT_PUBLIC_PRIVY_APP_ID is set. This hook mirrors
 * that guard so it never calls Privy hooks in a Privy-less tree.
 */

import { useAccount } from "wagmi";
import { usePrivy, useWallets } from "@privy-io/react-auth";

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
 * Privy hooks are only called when PRIVY_ENABLED is true — which is
 * exactly when <PrivyProvider> is mounted in WalletProviders.
 * When Privy is disabled, only wagmi/Reown is used.
 */
export function useConnectedWallet(): ConnectedWallet {
  const { address: wagmiAddress } = useAccount();

  // Only call Privy hooks when the provider is actually mounted.
  // This avoids "PrivyProvider not found" crashes in environments
  // where NEXT_PUBLIC_PRIVY_APP_ID is not configured.
  const privy = PRIVY_ENABLED ? usePrivy() : ({} as ReturnType<typeof usePrivy>);
  const { wallets } = PRIVY_ENABLED ? useWallets() : { wallets: [] };

  // Only use Privy data when configured AND authenticated
  const privyAddress =
    PRIVY_ENABLED && privy.authenticated && wallets.length > 0
      ? wallets[0].address
      : null;

  const address = privyAddress || wagmiAddress || null;
  const via = privyAddress ? "privy" : wagmiAddress ? "reown" : null;

  return {
    address,
    via,
    isConnected: !!address,
  };
}
