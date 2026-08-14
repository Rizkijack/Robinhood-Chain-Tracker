import { CHAIN, recommendedClientRefreshMs } from "./constants";
import type { FeedResponse, TrackedPair } from "./types";
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
import { enrichRobinhoodWithDefiLlama } from "./sources/defillama";
import {
  fetchLaunchpadTokens,
  getCachedLaunchpadTokens,
  launchpadRefreshMs,
} from "./sources/launchpad";
import type { LaunchpadFeedResponse } from "./sources/launchpad/types";
import {
  isGraduated,
  launchpadTokenToTrackedPair,
} from "./sources/launchpad/to-tracked-pair";
import { mergeLists, mergePair } from "./merge";

// ---- sort helpers ----------------------------------------------------------

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

// ---- logger ----------------------------------------------------------------

function logError(source: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const timestamp = new Date().toISOString();
  console.error(JSON.stringify({
    level: "error",
    timestamp,
    source,
    message: message.slice(0, 500),
  }));
}

// ---- New Pairs Feed --------------------------------------------------------

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
  else {
    logError("dexscreener-profiles", profilesRes.reason);
    errors.push({ source: "dexscreener-profiles", message: String(profilesRes.reason) });
  }

  if (boostsRes.status === "fulfilled") boosts = boostsRes.value;
  else {
    logError("dexscreener-boosts", boostsRes.reason);
    errors.push({ source: "dexscreener-boosts", message: String(boostsRes.reason) });
  }

  if (beNewRes.status === "fulfilled") beNew = beNewRes.value;
  else {
    logError("birdeye-new-listings", beNewRes.reason);
    errors.push({ source: "birdeye-new-listings", message: String(beNewRes.reason) });
  }

  if (geoNewRes.status === "fulfilled") geoNew = geoNewRes.value;
  else {
    logError("geckoterminal-new-pools", geoNewRes.reason);
    errors.push({ source: "geckoterminal-new-pools", message: String(geoNewRes.reason) });
  }

  let pairs = mergeLists(profiles, boosts, beNew, geoNew);
  pairs = sortByNewest(pairs);

  // Best-effort real-time price/market-cap enrichment from global aggregators.
  try {
    pairs = await enrichRobinhoodWithCoinGecko(pairs);
  } catch (e) {
    logError("coingecko-enrich", e);
    errors.push({ source: "coingecko-enrich", message: String(e) });
  }
  try {
    pairs = await enrichRobinhoodWithDefiLlama(pairs);
  } catch (e) {
    logError("defillama-enrich", e);
    errors.push({ source: "defillama-enrich", message: String(e) });
  }

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
      "CoinGecko price enrichment (Robinhood tokens)",
    ],
    count: pairs.length,
    pairs,
    errors: errors.length ? errors : undefined,
    recommendedRefreshMs: recommendedClientRefreshMs(),
  };
}

// ---- Trending Feed ---------------------------------------------------------

export async function getTrendingFeed(): Promise<FeedResponse> {
  const errors: { source: string; message: string }[] = [];
  let pairs: TrackedPair[] = [];

  const [dexRes, beRes, geoRes] = await Promise.allSettled([
    fetchDexRealTimeTrending(30),
    fetchBirdeyeRealTimeTrending(30),
    fetchGeckoTrendingPools(30),
  ]);

  if (dexRes.status === "fulfilled") pairs.push(...dexRes.value);
  else {
    logError("dexscreener-realtime-trending", dexRes.reason);
    errors.push({ source: "dexscreener-realtime-trending", message: String(dexRes.reason) });
  }

  if (beRes.status === "fulfilled") pairs.push(...beRes.value);
  else {
    logError("birdeye-realtime-trending", beRes.reason);
    errors.push({ source: "birdeye-realtime-trending", message: String(beRes.reason) });
  }

  if (geoRes.status === "fulfilled") pairs.push(...geoRes.value);
  else {
    logError("geckoterminal-trending-pools", geoRes.reason);
    errors.push({ source: "geckoterminal-trending-pools", message: String(geoRes.reason) });
  }

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
    logError("dexscreener-enrich", e);
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
    logError("geckoterminal-enrich", e);
    errors.push({ source: "geckoterminal-enrich", message: String(e) });
  }

  // Best-effort price/market-cap enrichment from global aggregators
  try {
    merged = await enrichRobinhoodWithCoinGecko(merged);
  } catch (e) {
    logError("coingecko-enrich", e);
    errors.push({ source: "coingecko-enrich", message: String(e) });
  }
  try {
    merged = await enrichRobinhoodWithCoinMarketCap(merged);
  } catch (e) {
    logError("coinmarketcap-enrich", e);
    errors.push({ source: "coinmarketcap-enrich", message: String(e) });
  }
  try {
    merged = await enrichRobinhoodWithDefiLlama(merged);
  } catch (e) {
    logError("defillama-enrich", e);
    errors.push({ source: "defillama-enrich", message: String(e) });
  }

  // Launchpads (Kombinasi): graduated tokens with a real pool join trending.
  // Cached-only read — never blocks trending on slow launchpad APIs.
  try {
    const lp = await getCachedLaunchpadTokens();
    const graduated = lp
      .filter(isGraduated)
      .map(launchpadTokenToTrackedPair);
    if (graduated.length) {
      merged = mergeLists(merged, graduated);
    }
  } catch (e) {
    logError("launchpad-merge", e);
    errors.push({ source: "launchpad-merge", message: String(e) });
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
      "DefiLlama price enrichment (Robinhood tokens)",
      "Launchpads (graduated)",
    ],
    count: merged.length,
    pairs: merged,
    errors: errors.length ? errors : undefined,
    recommendedRefreshMs: recommendedClientRefreshMs(),
  };
}

// ---- Boosts Feed -----------------------------------------------------------

export async function getBoostsFeed(): Promise<FeedResponse> {
  const errors: { source: string; message: string }[] = [];
  let pairs: TrackedPair[] = [];
  try {
    pairs = await fetchDexBoosts();
  } catch (e) {
    logError("dexscreener-boosts", e);
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

// ---- Search ----------------------------------------------------------------

export async function searchPairs(q: string): Promise<FeedResponse> {
  const errors: { source: string; message: string }[] = [];
  let pairs: TrackedPair[] = [];
  const [dexRes, geoRes] = await Promise.allSettled([searchDex(q), searchGecko(q)]);

  if (dexRes.status === "fulfilled") pairs.push(...dexRes.value);
  else {
    logError("dexscreener-search", dexRes.reason);
    errors.push({ source: "dexscreener-search", message: String(dexRes.reason) });
  }

  if (geoRes.status === "fulfilled") pairs.push(...geoRes.value);
  else {
    logError("geckoterminal-search", geoRes.reason);
    errors.push({ source: "geckoterminal-search", message: String(geoRes.reason) });
  }

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
    recommendedRefreshMs: recommendedClientRefreshMs(),
  };
}

// ---- Launchpads -------------------------------------------------------------

export async function getLaunchpadFeed(): Promise<LaunchpadFeedResponse> {
  const feed = await fetchLaunchpadTokens();
  return {
    ...feed,
    recommendedRefreshMs: launchpadRefreshMs(),
  };
}
