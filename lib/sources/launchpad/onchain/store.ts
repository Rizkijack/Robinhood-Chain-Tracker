/**
 * Persistent store for the on-chain launchpad indexer.
 *
 * Tracks the last-scanned block per platform factory so the indexer
 * only scans new blocks on each run. Backed by Upstash Redis (shared
 * across serverless instances); falls back to an in-memory Map when
 * Redis is not configured (local dev — resets on restart, acceptable).
 */

import { getRedis } from "../../../redis-client";
import type { LaunchpadSourceId } from "../types";

const PREFIX = "rh:lp:onchain:";
const TTL_S = 60 * 60 * 24 * 30; // 30 days — cursor persists across deploys

// In-memory fallback (dev without Redis).
const memCursor = new Map<string, number>();

/**
 * Read the last-scanned block for a platform. Returns `fallback`
 * (usually the platform's deploy block) when nothing is stored yet.
 */
export async function getLastScannedBlock(
  platform: LaunchpadSourceId,
  fallback: number
): Promise<number> {
  const redis = getRedis();
  if (redis) {
    try {
      const v = await redis.get<number>(`${PREFIX}${platform}`);
      if (typeof v === "number" && v > 0) return v;
    } catch {
      // Redis unreachable — fall through to memory
    }
  }
  const mem = memCursor.get(platform);
  return mem ?? fallback;
}

/** Persist the last-scanned block for a platform. */
export async function setLastScannedBlock(
  platform: LaunchpadSourceId,
  block: number
): Promise<void> {
  memCursor.set(platform, block);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(`${PREFIX}${platform}`, block, { ex: TTL_S });
    } catch {
      // Non-critical — memory cursor still works for this process.
    }
  }
}

/** Test helper — clear cursors. */
export async function _resetIndexerCursor(): Promise<void> {
  memCursor.clear();
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys(`${PREFIX}*`);
      if (keys.length) await redis.del(...keys);
    } catch {
      // ignore
    }
  }
}
