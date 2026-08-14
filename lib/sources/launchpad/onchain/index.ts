/**
 * On-chain launchpad source — public entry point.
 *
 * Architecture (important):
 *   - `refreshOnchainIndex()` runs the indexer (chunked eth_getLogs
 *     scans of NEW blocks only, from the stored cursor), MERGES the
 *     result with the existing index in Redis, applies the market-cap
 *     filter (≥ $10k), and persists. Called from the cron endpoint
 *     (`/api/cron/refresh?feed=launchpads`) — never from the request
 *     path. The cron runs DAILY (Vercel Hobby limit), so the index is
 *     rebuilt once/day and must survive the 24h gap via the longer TTL.
 *   - `getOnchainTokens()` reads the stored index from Redis. Returns []
 *     when the index hasn't been built yet. Cheap for request paths.
 *   - The initial 7-day backfill is done once via
 *     `scripts/launchpad-backfill.mjs` (local), which writes the cursors
 *     and the seed index. The cron then only advances the cursors.
 */

import { cacheGet, cacheSet } from "../../../cache";
import { fetchOnchainLaunches, filterByMarketCap, resolveLaunchTimestamps } from "./indexer";
import type { LaunchpadToken } from "../types";

const INDEX_KEY = "launchpad:onchain:index";
// 48 hours — the cron is DAILY on Vercel Hobby; each rebuild rewrites the
// index and extends the TTL, so 48h gives a full day of buffer if a run is
// missed or fails before the next run can refresh it.
const INDEX_TTL_S = 60 * 60 * 48;

/** Read the pre-built on-chain index (fast, request-path safe). */
export async function getOnchainTokens(): Promise<LaunchpadToken[]> {
  const cached = await cacheGet<LaunchpadToken[]>(INDEX_KEY);
  return cached ?? [];
}

/**
 * Run the indexer (scan new blocks since cursor), merge with the stored
 * index, apply the market-cap filter, and persist. Called by the cron.
 * Returns the fresh token list (or [] on total failure).
 */
export async function refreshOnchainIndex(): Promise<LaunchpadToken[]> {
  const { tokens: fresh, errors } = await fetchOnchainLaunches();
  if (errors.length) {
    console.warn("[launchpad:onchain] platform errors:", errors);
  }

  // Read the previous index directly from the cache.
  const previous = (await cacheGet<LaunchpadToken[]>(INDEX_KEY)) ?? [];

  // Total scan failure must never wipe the index — keep the last good
  // snapshot and extend its TTL so a transient RPC outage doesn't
  // expire the index before the next cron run.
  if (fresh.length === 0 && errors.length > 0) {
    if (previous.length) await cacheSet(INDEX_KEY, previous, INDEX_TTL_S * 1000);
    return previous;
  }

  // Merge fresh tokens with the previous index (dedupe by token address,
  // prefer the fresh entry so launch metadata stays current).
  const byAddress = new Map<string, LaunchpadToken>();
  for (const t of previous) byAddress.set(t.tokenAddress, t);
  for (const t of fresh) byAddress.set(t.tokenAddress, t);

  const merged = [...byAddress.values()];
  const withTs = await resolveLaunchTimestamps(merged);

  // Market-cap filter across the WHOLE index (seed backfill included):
  // tokens that never reached ≥ $10k are dropped.
  const filtered = await filterByMarketCap(withTs, errors);
  const trimmed = filtered.slice(0, 500); // cap: 500 tracked tokens max

  await cacheSet(INDEX_KEY, trimmed, INDEX_TTL_S * 1000);
  return trimmed;
}
