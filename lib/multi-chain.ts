/**
 * Multi-chain configuration and registry.
 *
 * Infrastructure ready for expanding beyond Robinhood Chain to
 * Base, Arbitrum, and other EVM L2s.
 */

export interface ChainConfig {
  id: string;
  name: string;
  chainId: number;
  nativeGas: string;
  explorer: string;
  rpcUrl?: string;
  color: string;
  enabled: boolean;
}

export const CHAINS: Record<string, ChainConfig> = {
  robinhood: {
    id: "robinhood",
    name: "Robinhood Chain",
    chainId: 4663,
    nativeGas: "ETH",
    explorer: "https://robinhoodchain.blockscout.com",
    color: "#0ea5e9",
    enabled: true,
  },
  base: {
    id: "base",
    name: "Base",
    chainId: 8453,
    nativeGas: "ETH",
    explorer: "https://basescan.org",
    color: "#0052ff",
    enabled: false,
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum One",
    chainId: 42161,
    nativeGas: "ETH",
    explorer: "https://arbiscan.io",
    color: "#28a0f0",
    enabled: false,
  },
};

/** Get all enabled chains. */
export function getEnabledChains(): ChainConfig[] {
  return Object.values(CHAINS).filter((c) => c.enabled);
}

/** Get all registered chains (including disabled). */
export function getAllChains(): ChainConfig[] {
  return Object.values(CHAINS);
}

/** Get a chain by its slug. */
export function getChain(id: string): ChainConfig | undefined {
  return CHAINS[id];
}

/** Get a chain by its numeric chain ID. */
export function getChainByChainId(chainId: number): ChainConfig | undefined {
  return Object.values(CHAINS).find((c) => c.chainId === chainId);
}
