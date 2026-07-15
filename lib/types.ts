export type TrackSource =
  | "dexscreener"
  | "profiles"
  | "boosts"
  | "birdeye"
  | "geckoterminal"
  | "coingecko"
  | "coinmarketcap";

export interface TrackedPair {
  id: string;
  pairAddress: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  quoteSymbol: string;
  dexId: string;
  dexName: string;
  priceUsd: number | null;
  priceNative: number | null;
  liquidityUsd: number | null;
  volume5m: number | null;
  volume1h: number | null;
  volume6h: number | null;
  volume24h: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;
  txns5m: number | null;
  txns1h: number | null;
  txns24h: number | null;
  buys5m: number | null;
  sells5m: number | null;
  buys1h: number | null;
  sells1h: number | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
  ageMs: number | null;
  imageUrl: string | null;
  sources: TrackSource[];
  links: {
    dexscreener: string;
    birdeye: string;
    geckoterminal?: string;
    coingecko?: string;
    coinmarketcap?: string;
  };
  description?: string | null;
  socials?: { type: string; url: string }[];
  websites?: { url: string; label?: string }[];
  boosted?: boolean;
  boostAmount?: number;
}

export interface FeedResponse {
  updatedAt: string;
  chain: {
    id: string;
    name: string;
    chainId: number;
    nativeGas: string;
  };
  sources: string[];
  count: number;
  pairs: TrackedPair[];
  errors?: { source: string; message: string }[];
  /** Recommended client auto-refresh cadence (ms), derived from enabled sources' rate limits */
  recommendedRefreshMs?: number;
}

export interface PoolSummary {
  poolAddress: string;
  dexId: string;
  dexName: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
  ageMs: number | null;
  txns24h: number | null;
}

export interface OhlcvPoint {
  /** Unix milliseconds */
  t: number;
  o: number | null;
  h: number | null;
  l: number | null;
  c: number | null;
  v: number | null;
}

export interface TokenDetail {
  updatedAt: string;
  chain: {
    id: string;
    name: string;
    chainId: number;
    nativeGas: string;
  };
  address: string;
  token: TrackedPair | null;
  pools: PoolSummary[];
  ohlcv: OhlcvPoint[] | null;
  socials: { type: string; url: string }[];
  websites: { url: string; label?: string }[];
  sources: string[];
  errors?: { source: string; message: string }[];
  /** Recommended client auto-refresh cadence (ms) */
  recommendedRefreshMs?: number;
}

export interface StatsResponse {
  updatedAt: string;
  newPairs: number;
  trending: number;
  profiles: number;
  boosts: number;
  dexes: string[];
  keyMetrics?: {
    totalLiquidityUsd?: number;
    totalVolume24hUsd?: number;
    avgLiquidityPerPair?: number;
    topVolumePair?: { name: string; volume24h: number };
  };
  /** Recommended client auto-refresh cadence (ms), derived from enabled sources' rate limits */
  recommendedRefreshMs?: number;
}
