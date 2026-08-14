/**
 * On-chain launchpad source — public entry point.
 *
 * Architecture (important):
 *   - `refreshOnchainIndex()` runs the indexer (chunked eth_getLogs
 *     scans) and STORES the resulting tokens in Redis. Called ONLY from
 *     the cron endpoint (`/api/cron/refresh?feed=launchpads`), never
 *     from the request path — a full backfill is far too slow for a
 *     serverless request.
 *   - `getOnchainTokens()` reads the stored index from Redis. Returns []
 *     when the index hasn't been built yet (first deploy before the
 *     first cron run). Cheap enough for request paths.
 */

import { cacheGet, cacheSet } from "../../../cache";
import { fetchOnchainLaunches, resolveLaunchTimestamps } from "./indexer";
import type { LaunchpadToken } from "../types";

const INDEX_KEY = "launchpad:onchain:index";
const INDEX_TTL_S = 60 * 60 * 6; // 6 hours — refreshed by cron every 5 min

/** Read the pre-built on-chain index (fast, request-path safe). */
export async function getOnchainTokens(): Promise<LaunchpadToken[]> {
  const cached = await cacheGet<LaunchpadToken[]>(INDEX_KEY);
  return cached ?? [];
}

/**
 * Run the indexer and persist the result. Called by the cron.
 * Returns the fresh token list (or [] on RPC failure).
 */
export async function refreshOnchainIndex(): Promise<LaunchpadToken[]> {
  const { tokens, errors } = await fetchOnchainLaunches();
  if (errors.length) {
    console.warn("[launchpad:onchain] platform errors:", errors);
  }
  const withTs = await resolveLaunchTimestamps(tokens);
  const trimmed = withTs.slice(0, 200);
  await cacheSet(INDEX_KEY, trimmed, INDEX_TTL_S * 1000);
  return trimmed;
}
