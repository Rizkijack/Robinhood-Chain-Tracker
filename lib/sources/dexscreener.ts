import {
  CHAIN,
  DEXSCREENER_BASE,
  SOURCE_TIMING,
  USER_AGENT,
} from "../constants";
import { cached } from "../cache";
import { num } from "../format";
import type { TrackSource, TrackedPair } from "../types";
import { buildExternalLinks } from "./shared";

async function dexFetch(path: string): Promise<unknown> {
  const res = await fetch(`${DEXSCREENER_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  } as RequestInit);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DexScreener ${res.status}: ${text.slice(0, 180)}`);
  }
  return res.json();
}

interface DexPairRaw {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  labels?: string[];
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceNative?: string;
  priceUsd?: string;
  txns?: Record<string, { buys?: number; sells?: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { url: string; label?: string }[];
    socials?: { url?: string; type?: string; platform?: string; handle?: string }[];
  };
  boosts?: { active?: number };
}

function mapDexPair(p: DexPairRaw, sources: TrackedPair["sources"]): TrackedPair {
  const pairAddress = String(p.pairAddress || "").toLowerCase();
  const tokenAddress = String(p.baseToken?.address || "").toLowerCase();
  const createdAt = p.pairCreatedAt ?? null;
  const ageMs = createdAt != null ? Date.now() - createdAt : null;

  const m5 = p.txns?.m5;
  const h1 = p.txns?.h1;
  const h24 = p.txns?.h24;

  const labels = p.labels?.length ? ` ${p.labels.join(" ")}` : "";
  const dexName = `${p.dexId || "dex"}${labels}`.trim();

  const socials =
    p.info?.socials
      ?.map((s) => ({
        type: s.type || s.platform || "link",
        url: s.url || (s.handle ? `https://x.com/${s.handle}` : ""),
      }))
      .filter((s) => s.url) || [];

  return {
    id: `dex:${pairAddress || tokenAddress}`,
    pairAddress,
    tokenAddress,
    name: p.baseToken?.name || p.baseToken?.symbol || "Unknown",
    symbol: p.baseToken?.symbol || "???",
    quoteSymbol: p.quoteToken?.symbol || "WETH",
    dexId: p.dexId || "unknown",
    dexName,
    priceUsd: num(p.priceUsd),
    priceNative: num(p.priceNative),
    liquidityUsd: num(p.liquidity?.usd),
    volume5m: num(p.volume?.m5),
    volume1h: num(p.volume?.h1),
    volume6h: num(p.volume?.h6),
    volume24h: num(p.volume?.h24),
    priceChange5m: num(p.priceChange?.m5),
    priceChange1h: num(p.priceChange?.h1),
    priceChange6h: num(p.priceChange?.h6),
    priceChange24h: num(p.priceChange?.h24),
    txns5m:
      m5 ? (m5.buys || 0) + (m5.sells || 0) : null,
    txns1h: h1 ? (h1.buys || 0) + (h1.sells || 0) : null,
    txns24h: h24 ? (h24.buys || 0) + (h24.sells || 0) : null,
    buys5m: m5?.buys ?? null,
    sells5m: m5?.sells ?? null,
    buys1h: h1?.buys ?? null,
    sells1h: h1?.sells ?? null,
    fdv: num(p.fdv),
    marketCap: num(p.marketCap),
    pairCreatedAt: createdAt,
    ageMs,
    imageUrl: p.info?.imageUrl || null,
    sources,
    links: buildExternalLinks(pairAddress || tokenAddress, tokenAddress),
    websites: p.info?.websites,
    socials,
    boosted: (p.boosts?.active || 0) > 0,
    boostAmount: p.boosts?.active,
  };
}

export async function fetchDexTokenPairs(
  tokenAddress: string
): Promise<TrackedPair[]> {
  const addr = tokenAddress.toLowerCase();
  return cached(`dex:pairs:${addr}`, SOURCE_TIMING.dexscreener.cacheTtlMs, async () => {
    const json = (await dexFetch(
      `/token-pairs/v1/${CHAIN.id}/${addr}`
    )) as DexPairRaw[] | { pairs?: DexPairRaw[] };

    const list = Array.isArray(json) ? json : json.pairs || [];
    return list
      .filter((p) => (p.chainId || CHAIN.id) === CHAIN.id)
      .map((p) => mapDexPair(p, ["dexscreener"]));
  });
}

export async function enrichTokensWithDex(
  tokenAddresses: string[],
  limit = 12
): Promise<Map<string, TrackedPair>> {
  const unique = [...new Set(tokenAddresses.map((a) => a.toLowerCase()))]
    .filter(Boolean)
    .slice(0, limit);

  const map = new Map<string, TrackedPair>();
  // batch carefully to respect rate limits
  const batchSize = 4;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((addr) => fetchDexTokenPairs(addr))
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status !== "fulfilled" || !r.value.length) continue;
      // prefer highest liquidity pair
      const best = [...r.value].sort(
        (a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0)
      )[0];
      map.set(batch[j], best);
    }
  }
  return map;
}

interface ProfileRaw {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  icon?: string;
  header?: string;
  description?: string;
}

interface BoostRaw {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  amount?: number;
  totalAmount?: number;
  icon?: string;
  description?: string;
}

export async function fetchDexProfiles(): Promise<TrackedPair[]> {
  return cached("dex:profiles", SOURCE_TIMING.dexscreener.cacheTtlMs, async () => {
    const json = (await dexFetch("/token-profiles/latest/v1")) as ProfileRaw[];
    const rh = (json || []).filter((p) => p.chainId === CHAIN.id);
    const pairs: TrackedPair[] = [];

    for (const p of rh.slice(0, 20)) {
      const tokenAddress = String(p.tokenAddress || "").toLowerCase();
      if (!tokenAddress) continue;

      let detailed: TrackedPair | null = null;
      try {
        const list = await fetchDexTokenPairs(tokenAddress);
        detailed = list[0] || null;
      } catch {
        /* ignore per-token failures */
      }

      if (detailed) {
        pairs.push({
          ...detailed,
          sources: Array.from(
            new Set([...detailed.sources, "dexscreener", "profiles"])
          ) as TrackedPair["sources"],
          description: p.description || detailed.description,
          imageUrl: detailed.imageUrl || p.icon || null,
        });
      } else {
        pairs.push({
          id: `profile:${tokenAddress}`,
          pairAddress: "",
          tokenAddress,
          name: shortFromUrl(p.url) || "Profile token",
          symbol: "—",
          quoteSymbol: "WETH",
          dexId: "unknown",
          dexName: "—",
          priceUsd: null,
          priceNative: null,
          liquidityUsd: null,
          volume5m: null,
          volume1h: null,
          volume6h: null,
          volume24h: null,
          priceChange5m: null,
          priceChange1h: null,
          priceChange6h: null,
          priceChange24h: null,
          txns5m: null,
          txns1h: null,
          txns24h: null,
          buys5m: null,
          sells5m: null,
          buys1h: null,
          sells1h: null,
          fdv: null,
          marketCap: null,
          pairCreatedAt: null,
          ageMs: null,
          imageUrl: p.icon || null,
          sources: ["dexscreener", "profiles"],
          links: buildExternalLinks(tokenAddress, tokenAddress),
          description: p.description,
        });
      }
    }
    return pairs;
  });
}

export async function fetchDexBoosts(): Promise<TrackedPair[]> {
  return cached("dex:boosts", SOURCE_TIMING.dexscreener.cacheTtlMs, async () => {
    const [latest, top] = await Promise.all([
      dexFetch("/token-boosts/latest/v1") as Promise<BoostRaw[]>,
      dexFetch("/token-boosts/top/v1") as Promise<BoostRaw[]>,
    ]);

    const merged = new Map<string, BoostRaw>();
    for (const b of [...(latest || []), ...(top || [])]) {
      if (b.chainId !== CHAIN.id || !b.tokenAddress) continue;
      const key = b.tokenAddress.toLowerCase();
      const prev = merged.get(key);
      if (!prev || (b.totalAmount || b.amount || 0) > (prev.totalAmount || prev.amount || 0)) {
        merged.set(key, b);
      }
    }

    const pairs: TrackedPair[] = [];
    for (const [tokenAddress, b] of merged) {
      let detailed: TrackedPair | null = null;
      try {
        const list = await fetchDexTokenPairs(tokenAddress);
        detailed = list[0] || null;
      } catch {
        /* ignore */
      }

      if (detailed) {
        pairs.push({
          ...detailed,
          sources: Array.from(
            new Set([...detailed.sources, "dexscreener", "boosts"])
          ) as TrackedPair["sources"],
          boosted: true,
          boostAmount: b.totalAmount || b.amount,
          imageUrl: detailed.imageUrl || b.icon || null,
          description: b.description || detailed.description,
        });
      } else {
        pairs.push({
          id: `boost:${tokenAddress}`,
          pairAddress: "",
          tokenAddress,
          name: "Boosted token",
          symbol: "—",
          quoteSymbol: "WETH",
          dexId: "unknown",
          dexName: "—",
          priceUsd: null,
          priceNative: null,
          liquidityUsd: null,
          volume5m: null,
          volume1h: null,
          volume6h: null,
          volume24h: null,
          priceChange5m: null,
          priceChange1h: null,
          priceChange6h: null,
          priceChange24h: null,
          txns5m: null,
          txns1h: null,
          txns24h: null,
          buys5m: null,
          sells5m: null,
          buys1h: null,
          sells1h: null,
          fdv: null,
          marketCap: null,
          pairCreatedAt: null,
          ageMs: null,
          imageUrl: b.icon || null,
          sources: ["dexscreener", "boosts"],
          links: buildExternalLinks(tokenAddress, tokenAddress),
          description: b.description,
          boosted: true,
          boostAmount: b.totalAmount || b.amount,
        });
      }
    }
    return pairs;
  });
}

function shortFromUrl(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/robinhood\/(0x[a-fA-F0-9]+)/);
  return m ? m[1].slice(0, 10) : null;
}

/**
 * Fetch real-time trending pairs from DexScreener.
 * Uses a combination of:
 * - Token boosts (top/latest) — boosted tokens are actively trending
 * - Token profiles (latest) — newly profiled tokens gaining attention
 * - Batch token enrichment for real-time market data
 */
export async function fetchDexRealTimeTrending(limit = 25): Promise<TrackedPair[]> {
  return cached(`dex:realtime:trending:${limit}`, SOURCE_TIMING.dexscreener.cacheTtlMs, async () => {
    const [boostsJson, profilesJson] = await Promise.all([
      dexFetch("/token-boosts/top/v1") as Promise<BoostRaw[]>,
      dexFetch("/token-profiles/latest/v1") as Promise<ProfileRaw[]>,
    ]);

    // Collect unique token addresses from boosts and profiles
    const boostTokens = (boostsJson || [])
      .filter((b) => b.chainId === CHAIN.id && b.tokenAddress)
      .map((b) => b.tokenAddress!.toLowerCase());

    const profileTokens = (profilesJson || [])
      .filter((p) => p.chainId === CHAIN.id && p.tokenAddress)
      .map((p) => p.tokenAddress!.toLowerCase());

    // Score tokens: boosts get higher weight
    const scores = new Map<string, number>();

    for (const addr of boostTokens) {
      // Boosted tokens get base score + recency
      scores.set(addr, (scores.get(addr) || 0) + 100);
    }
    for (const addr of profileTokens) {
      // Profile tokens get moderate score
      scores.set(addr, (scores.get(addr) || 0) + 50);
    }

    // Get top scored unique addresses
    const topAddrs = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([addr]) => addr);

    if (!topAddrs.length) return [];

    // Batch enrich with real-time market data
    const enriched = await fetchDexBatchTokens(topAddrs, limit);

    const pairs: TrackedPair[] = [];
    for (const addr of topAddrs) {
      const pair = enriched.get(addr);
      if (pair) {
        // Boost the sources
        const sources = new Set([...pair.sources, "dexscreener"] as TrackSource[]);
        if (boostTokens.includes(addr)) sources.add("boosts" as TrackSource);
        if (profileTokens.includes(addr)) sources.add("profiles" as TrackSource);
        pairs.push({
          ...pair,
          sources: [...sources] as TrackedPair["sources"],
        });
      }
    }

    // Sort by volume descending for true "trending" order
    return pairs.sort(
      (a, b) => (b.volume1h || b.volume24h || 0) - (a.volume1h || a.volume24h || 0)
    );
  });
}

export async function searchDex(query: string): Promise<TrackedPair[]> {
  const q = query.trim();
  if (!q) return [];
  return cached(`dex:search:${q.toLowerCase()}`, SOURCE_TIMING.dexscreener.cacheTtlMs, async () => {
    const json = (await dexFetch(
      `/latest/dex/search?q=${encodeURIComponent(q)}`
    )) as { pairs?: DexPairRaw[] };
    return (json.pairs || [])
      .filter((p) => p.chainId === CHAIN.id)
      .map((p) => mapDexPair(p, ["dexscreener"]));
  });
}

/**
 * Batch fetch token data from DexScreener using the /tokens/v1 endpoint.
 * More efficient than individual lookups — fetches up to 30 tokens at once.
 * Returns a map of tokenAddress → best pair data (highest liquidity).
 */
export async function fetchDexBatchTokens(
  tokenAddresses: string[],
  limit = 30
): Promise<Map<string, TrackedPair>> {
  const unique = [...new Set(tokenAddresses.map((a) => a.toLowerCase()))]
    .filter(Boolean)
    .slice(0, limit);

  if (!unique.length) return new Map();

  const cacheKey = `dex:batch:${unique.join(":")}`;
  return cached(cacheKey, SOURCE_TIMING.dexscreener.cacheTtlMs, async () => {
    const addrsParam = unique.join(",");
    const json = (await dexFetch(
      `/tokens/v1/${CHAIN.id}/${addrsParam}`
    )) as DexPairRaw[];

    const map = new Map<string, TrackedPair>();
    const byToken = new Map<string, DexPairRaw[]>();

    for (const pair of json || []) {
      const addr = String(pair.baseToken?.address || "").toLowerCase();
      if (!addr) continue;
      const list = byToken.get(addr) || [];
      list.push(pair);
      byToken.set(addr, list);
    }

    for (const [addr, pairs] of byToken) {
      // Prefer highest liquidity pair
      const best = pairs.sort(
        (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      )[0];
      map.set(addr, mapDexPair(best, ["dexscreener"]));
    }

    return map;
  });
}

/**
 * Enrich token addresses using the batch /tokens/v1 endpoint.
 * Falls back to individual /token-pairs lookups for any tokens
 * not found in the batch response.
 */
export async function enrichTokensBatch(
  tokenAddresses: string[],
  limit = 20
): Promise<Map<string, TrackedPair>> {
  const unique = [...new Set(tokenAddresses.map((a) => a.toLowerCase()))]
    .filter(Boolean)
    .slice(0, limit);

  const map = new Map<string, TrackedPair>();
  const missing: string[] = [];

  // Try batch first
  try {
    const batch = await fetchDexBatchTokens(unique, limit);
    for (const [addr, pair] of batch) {
      map.set(addr, pair);
    }
  } catch {
    // If batch fails, fall back to individual lookups
  }

  // Find tokens not covered by batch
  for (const addr of unique) {
    if (!map.has(addr)) missing.push(addr);
  }

  // Fall back to individual lookups for missing tokens
  if (missing.length) {
    const batchSize = 4;
    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((addr) => fetchDexTokenPairs(addr))
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status !== "fulfilled" || !r.value.length) continue;
        const best = [...r.value].sort(
          (a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0)
        )[0];
        map.set(batch[j], best);
      }
    }
  }

  return map;
}
