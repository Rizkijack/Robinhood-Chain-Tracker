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

/** GoPlus / DexScreener token security assessment */
export interface TokenSecurity {
  is_honeypot: boolean;
  is_open_source: boolean;
  is_proxy: boolean;
  is_mintable: boolean;
  cannot_buy: boolean;
  cannot_sell_all: boolean;
  is_blacklisted: boolean;
  is_whitelisted: boolean;
  hidden_owner: boolean;
  selfdestruct: boolean;
  external_call: boolean;
  transfer_pausable: boolean;
  trading_cooldown: boolean;
  anti_whale_modifiable: boolean;
  personal_slippage_modifiable: boolean;
  owner_change_balance: boolean;
  can_take_back_ownership: boolean;
  is_airdrop_scam: boolean;
  is_anti_whale: boolean;
  buy_tax: number;
  sell_tax: number;
  holder_count: number;
  lp_holder_count: number;
  lp_total_supply: number | null;
  owner_address: string;
  owner_balance: string;
  creator_address: string;
  creator_balance: string;
  /** Computed risk score 0-100 (0 = safest) */
  riskScore: number;
  /** Computed risk level label */
  riskLevel: "safe" | "low" | "medium" | "high" | "critical";
  /** Raw GoPlus result (for debugging / display) */
  raw: Record<string, string>;
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

/** Real-time transaction data for TokenDetailModal transaction stream */
export interface TokenTransaction {
  /** Transaction hash */
  hash: string;
  /** Transaction type */
  type: 'buy' | 'sell' | 'transfer' | 'mint' | 'burn';
  /** Trader wallet address */
  trader: string;
  /** Token amount traded */
  tokenAmount: number;
  /** Token symbol */
  tokenSymbol: string;
  /** USD value of the transaction */
  usdValue: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Gas used (optional) */
  gasUsed?: number;
  /** Gas fee in native token (optional) */
  gasFee?: number;
  /** DEX name where transaction occurred (optional) */
  dexName?: string;
  /** Block number in hex (optional) */
  blockNumber?: string;
  /** Whether this is a whale transaction (auto-calculated: usdValue > 10000) */
  isWhale?: boolean;
  /** Whether this is a mega whale transaction (auto-calculated: usdValue > 50000) */
  isMegaWhale?: boolean;
  /** Entity/label from Arkham Intelligence (optional) */
  entity?: string;
  /** Arkham entity logo URL (optional) */
  entityLogo?: string;
}

/** Transaction filter options */
export interface TransactionFilter {
  /** Filter by type */
  type: 'all' | 'buy' | 'sell' | 'transfer' | 'mint' | 'burn';
  /** Filter by time range */
  timeRange: '15m' | '1h' | '24h' | 'all';
  /** Minimum USD value */
  minValue: number;
  /** Search by wallet address */
  searchQuery: string;
}
