/**
 * Rate limiting — in-memory sliding window (development / fallback).
 *
 * In production (Vercel serverless), the in-memory `RateLimiter` is ineffective
 * because each instance has its own isolated memory. Instead, we use
 * `lib/redis-rate-limit.ts` which shares state across all instances via
 * Upstash Redis. If UPSTASH_REDIS_REST_URL/TOKEN are set, the exported
 * limiters use Redis. Otherwise they fall back to the in-memory `RateLimiter`
 * so local development works without external dependencies.
 *
 * Both implementations implement the `IRateLimiter` interface so
 * `lib/with-rate-limit.ts` works the same regardless of backend.
 */

import {
  API_RATE_LIMIT_MAX,
  STRICT_RATE_LIMIT_MAX,
  WHALE_RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_PRUNE_INTERVAL_MS,
} from "./constants";
import { RedisRateLimiter } from "./redis-rate-limit";

// ── Shared types ──────────────────────────────────────────────────

export interface RateLimiterOptions {
  /** Max number of requests allowed within the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Milliseconds until the window resets. */
  resetInMs: number;
  /** Current request count (for debugging/headers). */
  current: number;
}

/** Unified interface — sync (in-memory) or async (Redis). */
export interface IRateLimiter {
  readonly max: number;
  /** May return a Promise when backed by Redis. */
  check(key: string): RateLimitResult | Promise<RateLimitResult>;
}

// ── In-memory sliding window (default) ─────────────────────────────

export class RateLimiter implements IRateLimiter {
  private hits = new Map<string, number[]>();
  private readonly _max: number;
  private readonly window: number;

  constructor(opts: RateLimiterOptions) {
    this._max = opts.maxRequests;
    this.window = opts.windowMs;
  }

  get max(): number {
    return this._max;
  }

  /**
   * Check whether `key` is allowed to proceed.
   * Returns the result synchronously — no async overhead.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - this.window;

    let timestamps = this.hits.get(key);
    if (!timestamps) {
      timestamps = [];
      this.hits.set(key, timestamps);
    }

    // Drop entries outside the sliding window
    const valid = timestamps.filter((t) => t > cutoff);
    this.hits.set(key, valid);

    const current = valid.length;
    const allowed = current < this.max;
    const oldest = valid[0] ?? now;

    if (allowed) {
      valid.push(now);
    }

    return {
      allowed,
      remaining: Math.max(0, this.max - current - (allowed ? 1 : 0)),
      // Time until the oldest request in the window expires (= window resets)
      resetInMs: Math.max(1, oldest + this.window - now),
      current: current + (allowed ? 1 : 0),
    };
  }

  /**
   * Periodically purge stale entries to prevent memory leaks.
   * Call this on a setInterval or let it run via the middleware.
   */
  prune(): void {
    const now = Date.now();
    const cutoff = now - this.window * 2; // 2x window for safety
    for (const [key, timestamps] of this.hits) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, valid);
      }
    }
  }
}

// ── Auto-select Redis vs in-memory ─────────────────────────────────

const opts = (max: number) => ({ maxRequests: max, windowMs: RATE_LIMIT_WINDOW_MS });

const useRedis = RedisRateLimiter.isAvailable();

let _apiLimiter: IRateLimiter;
let _strictLimiter: IRateLimiter;
let _whaleLimiter: IRateLimiter;

if (useRedis) {
  _apiLimiter = new RedisRateLimiter(opts(API_RATE_LIMIT_MAX));
  _strictLimiter = new RedisRateLimiter(opts(STRICT_RATE_LIMIT_MAX));
  _whaleLimiter = new RedisRateLimiter(opts(WHALE_RATE_LIMIT_MAX));
} else {
  _apiLimiter = new RateLimiter(opts(API_RATE_LIMIT_MAX));
  _strictLimiter = new RateLimiter(opts(STRICT_RATE_LIMIT_MAX));
  _whaleLimiter = new RateLimiter(opts(WHALE_RATE_LIMIT_MAX));
}

/** Default API rate limiter: 60 requests per minute per IP+endpoint. */
export const apiLimiter: IRateLimiter = _apiLimiter;

/** Stricter limiter for search & token detail (30 req/min). */
export const strictLimiter: IRateLimiter = _strictLimiter;

/** Whale alerts limiter — 10 req/min (heavy Arkham endpoint). */
export const whaleLimiter: IRateLimiter = _whaleLimiter;

// In-memory pruner (only active when not using Redis — serverless instances
// are too short-lived for memory to leak, but local dev needs it).
if (typeof setInterval !== "undefined" && !useRedis) {
  const pruneTimer = setInterval(() => {
    (_apiLimiter as RateLimiter).prune();
    (_strictLimiter as RateLimiter).prune();
  }, RATE_LIMIT_PRUNE_INTERVAL_MS);

  if (typeof pruneTimer === "object" && "unref" in pruneTimer) {
    pruneTimer.unref();
  }
}
