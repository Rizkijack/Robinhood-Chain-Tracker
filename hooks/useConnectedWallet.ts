"use client";

/**
 * Unified wallet hook that reads from both Privy and wagmi/Reown.
 * Ensures the connected wallet address is available regardless
 * of which provider the user used to connect.
 *
 * Both Privy hooks (usePrivy, useWallets) are always called when
 * PRIVY_ENABLED — satisfying Rules of Hooks. WalletProviders only
 * mounts <PrivyProvider> when PRIVY_ENABLED is true, so the hooks
 * always have their provider context.
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
 * Hooks are called unconditionally — PRIVY_ENABLED guards the RESULT
 * usage, not the call itself.
 */
export function useConnectedWallet(): ConnectedWallet {
  // Always call hooks (Rules of Hooks — must not be conditional)
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
