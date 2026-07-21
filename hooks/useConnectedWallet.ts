"use client";

/**
 * Unified wallet hook that reads from both Privy and wagmi/Reown.
 * Ensures the connected wallet address is available regardless
 * of which provider the user used to connect.
 *
 * Privy hooks are always called (PrivyProvider is mounted in WalletProviders).
 * Results are used conditionally based on PRIVY_ENABLED flag.
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
 * Both hooks are called unconditionally to satisfy Rules of Hooks.
 * PRIVY_ENABLED guards only the result usage, not the call itself.
 */
export function useConnectedWallet(): ConnectedWallet {
  // Always call both hook sets (Rules of Hooks — must not be conditional)
  const { address: wagmiAddress } = useAccount();
  const privy = usePrivy();
  const { wallets } = useWallets();

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
