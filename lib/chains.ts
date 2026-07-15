/**
 * Robinhood Chain (Arbitrum L2, chain ID 4663) definitions for the two
 * wallet providers we integrate:
 *   - viem chain  → Reown AppKit (wagmi)
 *   - plain object → Privy (its own Chain type)
 *
 * The public RPC requires an Alchemy key (see README). Override it with
 * NEXT_PUBLIC_RH_RPC_URL when the backend/infra provides a real endpoint.
 */

import { defineChain } from "viem";
import { CHAIN } from "@/lib/constants";

const RH_RPC =
  process.env.NEXT_PUBLIC_RH_RPC_URL ||
  "https://robinhood-mainnet.g.alchemy.com/v2/";

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
