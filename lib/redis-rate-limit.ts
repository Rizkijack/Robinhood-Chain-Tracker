/**
 * Redis-backed rate limiter (Upstash) for production multi-instance rate limiting.
 *
 * On Vercel, serverless function instances are ephemeral and each has its own
 * memory. In-memory rate limiters (lib/rate-limit.ts) are per-instance and
 * therefore ineffective at coordinating rate limits across instances.
 *
 * Upstash Redis solves this: all instances share the same atomic counters via
 * a globally-accessible HTTP-based Redis. The free tier handles this use case.
 *
 * If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set, this
 * module falls back to the in-memory Map so local development works without
 * any external dependency — the `isAvailable()` static returns false.
 *
 * Algorithm: fixed-window with INCR + EXPIRE.
 *   - The window key is derived from `Math.floor(now / windowMs)` so requests
 *     are bucketed into fixed time windows. This is atomic (single INCR) and
 *     uses minimal Redis commands.
 *   - Slight inaccuracy at window boundaries is acceptable for rate limiting.
 */

import { Redis } from "@upstash/redis";
import type { IRateLimiter, RateLimiterOptions, RateLimitResult } from "./rate-limit";

// ─── Key prefix to avoid collisions if the Upstash DB is shared ────────────
const PREFIX = "rl:rh:";

// ─── Redis client (lazy singleton) ─────────────────────────────────────────
let _redis: Redis | null | undefined;

function getRedis(): Redis | null {
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

// ─── In-memory fallback (dev mode) ─────────────────────────────────────────
type Entry = { expires: number };
const memStore = new Map<string, Entry & { count: number }>();

// ─── RedisRateLimiter ──────────────────────────────────────────────────────

export class RedisRateLimiter implements IRateLimiter {
  private readonly _max: number;
  private readonly window: number;
  private readonly ttlSec: number;

  constructor(opts: RateLimiterOptions) {
    this._max = opts.maxRequests;
    this.window = opts.windowMs;
    this.ttlSec = Math.ceil(this.window / 1000) + 1;
  }

  get max(): number {
    return this._max;
  }

  /**
   * Returns true when Upstash Redis env vars are configured and the
   * @upstash/redis package is available.
   */
  static isAvailable(): boolean {
    const redis = getRedis();
    return redis !== null;
  }

  /**
   * Check whether `key` is allowed to proceed.
   * Returns a `Promise<RateLimitResult>` when backed by Redis, or a sync
   * `RateLimitResult` for the in-memory fallback.
   */
  async check(key: string): Promise<RateLimitResult> {
    const redis = getRedis();

    if (redis) {
      return this.redisCheck(redis, key);
    }

    return this.memCheck(key);
  }

  private async redisCheck(redis: Redis, key: string): Promise<RateLimitResult> {
    const now = Date.now();

    // Fixed window: bucket requests by window slot
    const slot = Math.floor(now / this.window);
    const redisKey = `${PREFIX}${key}:${slot}`;

    const count = await redis.incr(redisKey);

    // Set expiry on first request in this window
    if (count === 1) {
      await redis.expire(redisKey, this.ttlSec);
    }

    // Time until the current window ends
    const windowEnd = (slot + 1) * this.window;
    const resetInMs = Math.max(1, windowEnd - now);

    const allowed = count <= this._max;

    return {
      allowed,
      remaining: Math.max(0, this._max - count),
      resetInMs,
      current: count,
    };
  }

  private memCheck(key: string): RateLimitResult {
    const now = Date.now();

    let entry = memStore.get(key);
    if (!entry || entry.expires < now) {
      entry = { expires: now + this.window, count: 0 };
      memStore.set(key, entry);
    }

    entry.count++;
    const allowed = entry.count <= this._max;

    return {
      allowed,
      remaining: Math.max(0, this._max - entry.count),
      resetInMs: Math.max(1, entry.expires - now),
      current: entry.count,
    };
  }
}
