/**
 * Contract addresses on Robinhood Chain (chain ID 4663).
 * These are canonical Uniswap V2 deployment addresses on Robinhood L2.
 */

export const ROBINHOOD_ADDRESSES = {
  /** Uniswap V2 Router on Robinhood Chain */
  UNISWAP_V2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as const,
  /** Uniswap V2 Factory on Robinhood Chain */
  UNISWAP_V2_FACTORY: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" as const,
  /** WETH (Wrapped ETH) on Robinhood Chain — verified from official docs */
  WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as const,
} as const;

/** Known WETH-like wrapped native tokens by chain ID */
export const WETH_BY_CHAIN: Record<number, string> = {
  4663: ROBINHOOD_ADDRESSES.WETH,
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  11155111: "0x7b79995e5f793A07Bc00c21412e50Ecae07e87f9",
};
