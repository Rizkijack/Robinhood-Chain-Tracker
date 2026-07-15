import { CHAIN, recommendedClientRefreshMs } from "./constants";
import type { FeedResponse, StatsResponse, TrackedPair, TrackSource } from "./types";
import {
  enrichTokensBatch,
  fetchDexBoosts,
  fetchDexProfiles,
  fetchDexRealTimeTrending,
  searchDex,
} from "./sources/dexscreener";
import {
  fetchBirdeyeRealTimeTrending,
  fetchBirdeyeNewListings,
} from "./sources/birdeye";
import {
  enrichTokensWithGecko,
  fetchGeckoNewPools,
  fetchGeckoTrendingPools,
  searchGecko,
} from "./sources/geckoterminal";
import { enrichRobinhoodWithCoinGecko } from "./sources/coingecko";
import { enrichRobinhoodWithCoinMarketCap } from "./sources/coinmarketcap";

const RECOMMENDED_REFRESH = recommendedClientRefreshMs();

function mergePair(a: TrackedPair, b: TrackedPair): TrackedPair {
  const sources = Array.from(
    new Set([...a.sources, ...b.sources])
  ) as TrackSource[];

  const pickNum = (x: number | null, y: number | null) =>
    x != null ? x : y;

  return {
    ...a,
    ...b,
    name: a.name !== "Unknown" && a.name !== "—" ? a.name : b.name,
    symbol: a.symbol !== "—" && a.symbol !== "???" ? a.symbol : b.symbol,
    pairAddress: a.pairAddress || b.pairAddress,
    tokenAddress: a.tokenAddress || b.tokenAddress,
    dexId: a.dexId !== "unknown" ? a.dexId : b.dexId,
    dexName: a.dexName !== "—" ? a.dexName : b.dexName,
    priceUsd: pickNum(b.priceUsd, a.priceUsd),
    priceNative: pickNum(b.priceNative, a.priceNative),
    liquidityUsd: pickNum(b.liquidityUsd, a.liquidityUsd),
    volume5m: pickNum(b.volume5m, a.volume5m),
    volume1h: pickNum(b.volume1h, a.volume1h),
    volume6h: pickNum(b.volume6h, a.volume6h),
    volume24h: pickNum(b.volume24h, a.volume24h),
    priceChange5m: pickNum(b.priceChange5m, a.priceChange5m),
    priceChange1h: pickNum(b.priceChange1h, a.priceChange1h),
    priceChange6h: pickNum(b.priceChange6h, a.priceChange6h),
    priceChange24h: pickNum(b.priceChange24h, a.priceChange24h),
    txns5m: pickNum(b.txns5m, a.txns5m),
    txns1h: pickNum(b.txns1h, a.txns1h),
    txns24h: pickNum(b.txns24h, a.txns24h),
    buys5m: pickNum(b.buys5m, a.buys5m),
    sells5m: pickNum(b.sells5m, a.sells5m),
    buys1h: pickNum(b.buys1h, a.buys1h),
    sells1h: pickNum(b.sells1h, a.sells1h),
    fdv: pickNum(b.fdv, a.fdv),
    marketCap: pickNum(b.marketCap, a.marketCap),
    pairCreatedAt: pickNum(a.pairCreatedAt, b.pairCreatedAt),
    ageMs:
      a.pairCreatedAt != null
        ? Date.now() - a.pairCreatedAt
        : b.pairCreatedAt != null
          ? Date.now() - b.pairCreatedAt
          : pickNum(a.ageMs, b.ageMs),
    imageUrl: a.imageUrl || b.imageUrl,
    sources,
    links: {
      dexscreener: a.links.dexscreener || b.links.dexscreener,
      birdeye: a.links.birdeye || b.links.birdeye,
      geckoterminal: a.links.geckoterminal || b.links.geckoterminal,
      coingecko: a.links.coingecko || b.links.coingecko,
      coinmarketcap: a.links.coinmarketcap || b.links.coinmarketcap,
    },
    description: a.description || b.description,
    socials: a.socials?.length ? a.socials : b.socials,
    websites: a.websites?.length ? a.websites : b.websites,
    boosted: a.boosted || b.boosted,
    boostAmount: a.boostAmount ?? b.boostAmount,
  };
}

function keyOf(p: TrackedPair): string {
  if (p.pairAddress) return `p:${p.pairAddress.toLowerCase()}`;
  return `t:${p.tokenAddress.toLowerCase()}`;
}

function mergeLists(...lists: TrackedPair[][]): TrackedPair[] {
  const map = new Map<string, TrackedPair>();
  for (const list of lists) {
    for (const pair of list) {
      const k = keyOf(pair);
      const prev = map.get(k);
      map.set(k, prev ? mergePair(prev, pair) : pair);
    }
  }
  return [...map.values()];
}

function sortByNewest(pairs: TrackedPair[]): TrackedPair[] {
  return [...pairs].sort((a, b) => {
    const ta = a.pairCreatedAt ?? 0;
    const tb = b.pairCreatedAt ?? 0;
    return tb - ta;
  });
}

function sortByVolume(pairs: TrackedPair[]): TrackedPair[] {
  return [...pairs].sort(
    (a, b) => (b.volume1h || b.volume24h || 0) - (a.volume1h || a.volume24h || 0)
  );
}

export async function getNewPairsFeed(): Promise<FeedResponse> {
  const errors: { source: string; message: string }[] = [];

  const [profilesRes, boostsRes, beNewRes, geoNewRes] = await Promise.allSettled([
    fetchDexProfiles(),
    fetchDexBoosts(),
    fetchBirdeyeNewListings(20),
    fetchGeckoNewPools(30),
  ]);

  let profiles: TrackedPair[] = [];
  let boosts: TrackedPair[] = [];
  let beNew: TrackedPair[] = [];
  let geoNew: TrackedPair[] = [];

  if (profilesRes.status === "fulfilled") profiles = profilesRes.value;
  else errors.push({ source: "dexscreener-profiles", message: String(profilesRes.reason) });

  if (boostsRes.status === "fulfilled") boosts = boostsRes.value;
  else errors.push({ source: "dexscreener-boosts", message: String(boostsRes.reason) });

  if (beNewRes.status === "fulfilled") beNew = beNewRes.value;
  else errors.push({ source: "birdeye-new-listings", message: String(beNewRes.reason) });

  if (geoNewRes.status === "fulfilled") geoNew = geoNewRes.value;
  else errors.push({ source: "geckoterminal-new-pools", message: String(geoNewRes.reason) });

  let pairs = mergeLists(profiles, boosts, beNew, geoNew);
  pairs = sortByNewest(pairs);

  return {
    updatedAt: new Date().toISOString(),
    chain: {
      id: CHAIN.id,
      name: CHAIN.name,
      chainId: CHAIN.chainId,
      nativeGas: CHAIN.nativeGas,
    },
    sources: [
      "DexScreener profiles",
      "DexScreener boosts",
      "Birdeye new listings",
      "GeckoTerminal new pools",
    ],
    count: pairs.length,
    pairs,
    errors: errors.length ? errors : undefined,
    recommendedRefreshMs: RECOMMENDED_REFRESH,
  };
}

export async function getTrendingFeed(): Promise<FeedResponse> {
  const errors: { source: string; message: string }[] = [];
  let pairs: TrackedPair[] = [];

  const [dexRes, beRes, geoRes] = await Promise.allSettled([
    fetchDexRealTimeTrending(30),
    fetchBirdeyeRealTimeTrending(30),
    fetchGeckoTrendingPools(30),
  ]);

  if (dexRes.status === "fulfilled") pairs.push(...dexRes.value);
  else errors.push({ source: "dexscreener-realtime-trending", message: String(dexRes.reason) });

  if (beRes.status === "fulfilled") pairs.push(...beRes.value);
  else errors.push({ source: "birdeye-realtime-trending", message: String(beRes.reason) });

  if (geoRes.status === "fulfilled") pairs.push(...geoRes.value);
  else errors.push({ source: "geckoterminal-trending-pools", message: String(geoRes.reason) });

  let merged = mergeLists(pairs);

  // Batch enrich top Robinhood tokens with DexScreener real-time data
  try {
    const addrs = merged.slice(0, 30).map((p) => p.tokenAddress);
    const enriched = await enrichTokensBatch(addrs, 30);
    merged = merged.map((p) => {
      const e = enriched.get(p.tokenAddress.toLowerCase());
      return e ? mergePair(p, e) : p;
    });
  } catch (e) {
    errors.push({ source: "dexscreener-enrich", message: String(e) });
  }

  // Enrich Robinhood rows with GeckoTerminal (image + coingecko id + liquidity)
  try {
    const robinhoodAddrs = merged.slice(0, 12).map((p) => p.tokenAddress);
    if (robinhoodAddrs.length) {
      const geoEnriched = await enrichTokensWithGecko(robinhoodAddrs, 12);
      merged = merged.map((p) => {
        const g = geoEnriched.get(p.tokenAddress.toLowerCase());
        return g ? mergePair(p, g) : p;
      });
    }
  } catch (e) {
    errors.push({ source: "geckoterminal-enrich", message: String(e) });
  }

  // Best-effort price/market-cap enrichment from global aggregators, by symbol.
  // These only fill fields on existing Robinhood rows — they never add
  // non-Robinhood tokens to the feed (CoinGecko/CMC don't index Robinhood).
  try {
    merged = await enrichRobinhoodWithCoinGecko(merged);
  } catch (e) {
    errors.push({ source: "coingecko-enrich", message: String(e) });
  }
  try {
    merged = await enrichRobinhoodWithCoinMarketCap(merged);
  } catch (e) {
    errors.push({ source: "coinmarketcap-enrich", message: String(e) });
  }

  merged = sortByVolume(merged);

  return {
    updatedAt: new Date().toISOString(),
    chain: {
      id: CHAIN.id,
      name: CHAIN.name,
      chainId: CHAIN.chainId,
      nativeGas: CHAIN.nativeGas,
    },
    sources: [
      "DexScreener real-time (boosts + profiles + volume)",
      "Birdeye real-time (rank + volume sorted)",
      "GeckoTerminal trending pools",
      "CoinGecko price enrichment (Robinhood tokens)",
      "CoinMarketCap price enrichment (Robinhood tokens)",
    ],
    count: merged.length,
    pairs: merged,
    errors: errors.length ? errors : undefined,
    recommendedRefreshMs: RECOMMENDED_REFRESH,
  };
}

export async function getBoostsFeed(): Promise<FeedResponse> {
  const errors: { source: string; message: string }[] = [];
  let pairs: TrackedPair[] = [];
  try {
    pairs = await fetchDexBoosts();
  } catch (e) {
    errors.push({ source: "dexscreener-boosts", message: String(e) });
  }

  return {
    updatedAt: new Date().toISOString(),
    chain: {
      id: CHAIN.id,
      name: CHAIN.name,
      chainId: CHAIN.chainId,
      nativeGas: CHAIN.nativeGas,
    },
    sources: ["DexScreener boosts"],
    count: pairs.length,
    pairs,
    errors: errors.length ? errors : undefined,
  };
}

export async function searchPairs(q: string): Promise<FeedResponse> {
  const errors: { source: string; message: string }[] = [];
  let pairs: TrackedPair[] = [];
  const [dexRes, geoRes] = await Promise.allSettled([searchDex(q), searchGecko(q)]);

  if (dexRes.status === "fulfilled") pairs.push(...dexRes.value);
  else errors.push({ source: "dexscreener-search", message: String(dexRes.reason) });

  if (geoRes.status === "fulfilled") pairs.push(...geoRes.value);
  else errors.push({ source: "geckoterminal-search", message: String(geoRes.reason) });

  return {
    updatedAt: new Date().toISOString(),
    chain: {
      id: CHAIN.id,
      name: CHAIN.name,
      chainId: CHAIN.chainId,
      nativeGas: CHAIN.nativeGas,
    },
    sources: ["DexScreener search", "GeckoTerminal search"],
    count: pairs.length,
    pairs,
    errors: errors.length ? errors : undefined,
    recommendedRefreshMs: RECOMMENDED_REFRESH,
  };
}

export async function getStats(): Promise<StatsResponse> {
  const [profiles, boosts, beNew, geoNew] = await Promise.allSettled([
    fetchDexProfiles(),
    fetchDexBoosts(),
    fetchBirdeyeNewListings(20),
    fetchGeckoNewPools(20),
  ]);

  const profilesCount = profiles.status === "fulfilled" ? profiles.value.length : 0;
  const boostsCount = boosts.status === "fulfilled" ? boosts.value.length : 0;
  const newPairsCount = beNew.status === "fulfilled" ? beNew.value.length : 0;
  const geoCount = geoNew.status === "fulfilled" ? geoNew.value.length : 0;

  // Compute keyMetrics across all successful fetches
  const allPairs: TrackedPair[] = [];
  for (const res of [profiles, boosts, beNew, geoNew]) {
    if (res.status === "fulfilled") allPairs.push(...res.value);
  }
  const totalLiquidityUsd = allPairs.reduce((sum, p) => sum + (p.liquidityUsd ?? 0), 0);
  const totalVolume24hUsd = allPairs.reduce((sum, p) => sum + (p.volume24h ?? 0), 0);
  const avgLiquidityPerPair = allPairs.length ? totalLiquidityUsd / allPairs.length : 0;
  const topVolumePair = allPairs.length
    ? allPairs.reduce((best, p) => ((p.volume24h ?? 0) > (best.volume24h ?? 0) ? p : best))
    : null;

  return {
    updatedAt: new Date().toISOString(),
    newPairs: newPairsCount + geoCount,
    trending: profilesCount + boostsCount + geoCount,
    profiles: profilesCount,
    boosts: boostsCount,
    dexes: ["DexScreener", "Birdeye", "GeckoTerminal", "CoinGecko", "CoinMarketCap"],
    keyMetrics: {
      totalLiquidityUsd: totalLiquidityUsd || undefined,
      totalVolume24hUsd: totalVolume24hUsd || undefined,
      avgLiquidityPerPair: avgLiquidityPerPair || undefined,
      topVolumePair: topVolumePair ? { name: topVolumePair.name, volume24h: topVolumePair.volume24h ?? 0 } : undefined,
    },
    recommendedRefreshMs: RECOMMENDED_REFRESH,
  };
}
