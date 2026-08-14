/**
 * Launchpad data source types — shared contract for all launchpad
 * platform adapters (Phase 1: public-API platforms; Phase 2: on-chain
 * factory-event indexers).
 */

/** Stable id for every supported launchpad platform. */
export type LaunchpadSourceId =
  // ── Phase 1: public API ─────────────────────────────────────
  | "lemon"
  | "bankr"
  | "poolstrade"
  | "sushi"
  | "o1exchange"
  // ── Phase 2: on-chain indexer (reserved) ────────────────────
  | "pons"
  | "ponsv2"
  | "flap"
  | "trench"
  | "bow"
  | "bags"
  | "poolsfun"
  | "letscash"
  | "long"
  | "varo"
  | "virtuals"
  | "noxa";

/**
 * Lifecycle phase of a launchpad token.
 * - `bonding`   – trading on a bonding curve (pre-pool)
 * - `auction`   – continuous clearing auction in progress (Pools.trade CCA)
 * - `graduated` – curve/auction completed, token has a real AMM pool
 */
export type LaunchpadPhase = "bonding" | "auction" | "graduated";

/** Normalized launchpad token — the single contract every adapter maps to. */
export interface LaunchpadToken {
  /** `${platform}:${tokenAddress}` — namespaced for dedup/merge. */
  id: string;
  platform: LaunchpadSourceId;
  /** Display name, e.g. "Lemon", "Pools.trade", "Sushi". */
  platformName: string;
  /** Lowercased 0x token contract address. */
  tokenAddress: string;
  /** AMM pool/pair address — null while bonding/auction (pre-pool). */
  pairAddress: string | null;
  name: string;
  symbol: string;
  phase: LaunchpadPhase;
  priceUsd: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  /** Unix ms. */
  launchTimeMs: number | null;
  ageMs: number | null;
  imageUrl: string | null;
  description: string | null;
  socials: { type: string; url: string }[];
  // ── Launchpad-specific metadata ──────────────────────────────
  /** Bonding/auction completion 0–100. */
  graduationProgressPct: number | null;
  /** Graduation target in quote units (e.g. 4.2 ETH). */
  thresholdQuote: number | null;
  devBuyUsd: number | null;
  holders: number | null;
  /** Human label, e.g. "70/30 creator/protocol". */
  feeSplit: string | null;
  taxRateBps: number | null;
  lockedLiquidity: boolean;
  /** WETH / USDG / stock ticker. */
  quoteSymbol: string | null;
}

/** Response shape of the aggregated launchpad feed. */
export interface LaunchpadFeedResponse {
  updatedAt: string;
  chain: {
    id: string;
    name: string;
    chainId: number;
    nativeGas: string;
  };
  /** Enabled platform display names. */
  sources: string[];
  count: number;
  tokens: LaunchpadToken[];
  errors?: { platform: string; message: string }[];
  recommendedRefreshMs: number;
}
