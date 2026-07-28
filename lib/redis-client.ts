/**
 * Shared Upstash Redis client singleton.
 *
 * Both `lib/cache.ts` and `lib/redis-rate-limit.ts` need a lazy-initialised
 * Redis client that returns `null` when env vars are not configured (local
 * development). Previously each file had its own copy of getRedis().
 *
 * This module consolidates that into one place.
 *
 * Usage:
 *   import { getRedis } from "./redis-client";
 *   const redis = getRedis();
 *   if (redis) { /* use Redis path *\/ }
 */

import { Redis } from "@upstash/redis";

// undefined = not yet initialized
let _redis: Redis | null | undefined;

/** Get or initialise the lazy Redis singleton. Returns null when env vars are missing. */
export function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    _redis = new Redis({ url, token });
  } else {
    _redis = null;
  }

  return _redis;
}

/** Reset the Redis singleton — test helper (also exported by files that wrap this). */
export function _resetRedisClient(): void {
  _redis = undefined;
}
