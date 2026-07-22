export const CHAIN = {
  id: "robinhood",
  name: "Robinhood Chain",
  chainId: 4663,
  nativeGas: "ETH",
  explorer: "https://robinhoodchain.blockscout.com",
  rpcHint: "https://rpc.mainnet.chain.robinhood.com",
} as const;

export const DEXSCREENER_BASE = "https://api.dexscreener.com";

export const GECKOTERMINAL_BASE = "https://api.geckoterminal.com/api/v2";
export const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
export const COINMARKETCAP_BASE = "https://pro-api.coinmarketcap.com/v1";

export const EXTERNAL_LINKS = {
  dexscreenerNew: "https://dexscreener.com/new-pairs/robinhood",
  dexscreener: "https://dexscreener.com/robinhood",
  birdeye: "https://birdeye.so/?chain=robinhood",
  robinhoodChain: "https://robinhood.com/us/en/chain/",
} as const;

export const KNOWN_DEXES = [
  "uniswap-v2-robinhood",
  "uniswap-v3-robinhood",
  "uniswap-v4-robinhood",
  "pancakeswap-v2-robinhood",
  "pancakeswap-v3-robinhood",
  "bankr-robinhood",
  "virtuals-robinhood",
] as const;

export const USER_AGENT = "RobinhoodPairTracker/1.0 (+local; research)";

/** Short-lived in-memory cache TTL (ms) to respect free API rate limits.
 *  Used as the default when a source does not define its own timing. */
export const CACHE_TTL_MS = 20_000;

/** Auto-refresh interval for the pair feed (fallback if no per-source timing applies). */
export const REFRESH_MS = 25_000;

/**
 * Per-source timing. Each source caches server-side at its own `cacheTtlMs`
 * so we never exceed the source's rate limit, while the client polls at
 * `recommendedClientRefreshMs()` (the fastest enabled source) to stay live.
 */
export interface SourceTiming {
  cacheTtlMs: number;
  refreshMs: number;
  requiresApiKey?: boolean;
  apiKeyEnv?: string;
}

export const SOURCE_TIMING: Record<string, SourceTiming> = {
  dexscreener: { cacheTtlMs: 20_000, refreshMs: 20_000 },
  birdeye: { cacheTtlMs: 30_000, refreshMs: 30_000, requiresApiKey: true, apiKeyEnv: "BIRDEYE_API_KEY" },
  geckoterminal: { cacheTtlMs: 30_000, refreshMs: 30_000 },
  coingecko: { cacheTtlMs: 60_000, refreshMs: 60_000 },
  coinmarketcap: { cacheTtlMs: 300_000, refreshMs: 300_000, requiresApiKey: true, apiKeyEnv: "COINMARKETCAP_API_KEY" },
};

/** Sources that are currently usable given the environment (API keys, etc.). */
export function enabledSources(): string[] {
  const out: string[] = [];
  for (const [name, t] of Object.entries(SOURCE_TIMING)) {
    if (t.requiresApiKey) {
      const key = t.apiKeyEnv ? process.env[t.apiKeyEnv] : undefined;
      if (key && key.trim()) out.push(name);
    } else {
      out.push(name);
    }
  }
  return out;
}

/** Fastest recommended client refresh across enabled sources (respects rate limits). */
export function recommendedClientRefreshMs(): number {
  const enabled = enabledSources();
  if (!enabled.length) return REFRESH_MS;
  const min = Math.min(
    ...enabled.map((s) => SOURCE_TIMING[s]?.refreshMs ?? REFRESH_MS)
  );
  return Math.max(min, 5_000);
}
