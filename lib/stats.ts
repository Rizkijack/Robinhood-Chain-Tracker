import { CHAIN, recommendedClientRefreshMs } from "./constants";
import type { StatsResponse, TrackedPair } from "./types";
import {
  fetchDexBoosts,
  fetchDexProfiles,
} from "./sources/dexscreener";
import {
  fetchBirdeyeNewListings,
} from "./sources/birdeye";
import {
  fetchGeckoNewPools,
} from "./sources/geckoterminal";
import { fetchLaunchpadTokens } from "./sources/launchpad";

/**
 * Aggregate stats from all sources — counts and key metrics
 * (total liquidity, volume, top pair).
 */
export async function getStats(): Promise<StatsResponse> {
  const [profiles, boosts, beNew, geoNew, launchpads] = await Promise.allSettled([
    fetchDexProfiles(),
    fetchDexBoosts(),
    fetchBirdeyeNewListings(20),
    fetchGeckoNewPools(20),
    fetchLaunchpadTokens(),
  ]);

  const profilesCount = profiles.status === "fulfilled" ? profiles.value.length : 0;
  const boostsCount = boosts.status === "fulfilled" ? boosts.value.length : 0;
  const newPairsCount = beNew.status === "fulfilled" ? beNew.value.length : 0;
  const geoCount = geoNew.status === "fulfilled" ? geoNew.value.length : 0;
  const launchpadCount =
    launchpads.status === "fulfilled" ? launchpads.value.count : 0;

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
    dexes: ["DexScreener", "Birdeye", "GeckoTerminal", "CoinGecko", "CoinMarketCap", "DefiLlama"],
    keyMetrics: {
      totalLiquidityUsd: totalLiquidityUsd || undefined,
      totalVolume24hUsd: totalVolume24hUsd || undefined,
      avgLiquidityPerPair: avgLiquidityPerPair || undefined,
      topVolumePair: topVolumePair ? { name: topVolumePair.name, volume24h: topVolumePair.volume24h ?? 0 } : undefined,
      launchpadCount: launchpadCount || undefined,
    },
    recommendedRefreshMs: recommendedClientRefreshMs(),
  };
}
