/**
 * Robinhood Chain (Arbitrum Orbit L2, chain ID 4663) definitions for
 * the two wallet providers we integrate:
 *   - viem chain  → Reown AppKit (wagmi)
 *   - plain object → Privy (its own Chain type)
 *
 * IMPORTANT — server-side RPC vs client-side RPC:
 *
 *   • The `ROBINHOOD_RPC_URL` exported here is used by the browser-side
 *     wagmi config (WalletProviders.tsx) and by any code that talks
 *     directly to viem. It MUST be a public, keyless URL because it
 *     ends up in the shipped JavaScript bundle.
 *
 *   • Server-side wallet APIs (/api/wallet/*) do NOT import this
 *     constant. They go through `lib/rpc.ts`, which keeps the
 *     operator RPC key (Alchemy / Dwellir / Tenderly) on the server
 *     and walks a fallback chain when one endpoint fails.
 *
 * The default is the official Robinhood-hosted public RPC. Override
 * it with NEXT_PUBLIC_RH_RPC_URL when you need a higher rate limit
 * or different region.
 */

import { defineChain } from "viem";
import { CHAIN } from "@/lib/constants";

const RH_RPC =
  process.env.NEXT_PUBLIC_RH_RPC_URL ||
  "https://robinhood-mainnet.g.alchemy.com/v2/qJtfjLqzeQL2yJ5NFXDjHNhtlyxwZyrD";

export const ROBINHOOD_RPC_URL = RH_RPC;

/** viem chain used by Reown AppKit / wagmi. */
export const robinhoodViemChain = defineChain({
  id: CHAIN.chainId,
  name: CHAIN.name,
  nativeCurrency: {
    name: CHAIN.nativeGas,
    symbol: CHAIN.nativeGas,
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [RH_RPC] },
  },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: CHAIN.explorer },
  },
  testnet: false,
});

/** Privy-flavoured chain object (Privy's own Chain type). */
export const robinhoodPrivyChain = {
  id: CHAIN.chainId,
  name: CHAIN.name,
  rpcUrl: RH_RPC,
  rpcUrls: { default: { http: [RH_RPC] } },
  nativeCurrency: {
    name: CHAIN.nativeGas,
    symbol: CHAIN.nativeGas,
    decimals: 18,
  },
  blockExplorerUrl: CHAIN.explorer,
} as const;

export const ROBINHOOD_CHAIN_ID_HEX = `0x${CHAIN.chainId.toString(16)}`;