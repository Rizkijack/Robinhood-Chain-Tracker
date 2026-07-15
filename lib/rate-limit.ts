/**
 * Lightweight in-memory sliding window rate limiter.
 * No external dependencies — runs entirely in-process.
 *
 * Each unique key (e.g. IP + endpoint) gets a sliding window of
 * `maxRequests` per `windowMs`. Old entries are lazily evicted.
 *
 * Usage:
 *   const limiter = new RateLimiter({ maxRequests: 60, windowMs: 60_000 });
 *   const result = limiter.check("127.0.0.1:/api/pairs/new");
 *   if (!result.allowed) return new Response("Too many", { status: 429 });
 */

interface RateLimiterOptions {
  /** Max number of requests allowed within the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Milliseconds until the window resets. */
  resetInMs: number;
  /** Current request count (for debugging/headers). */
  current: number;
}

export class RateLimiter {
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

/** Default API rate limiter: 60 requests per minute per IP+endpoint. */
export const apiLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: 60_000,
});

/** Stricter limiter for search & token detail (30 req/min). */
export const strictLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60_000,
});

/**
 * Prune stale entries every 5 minutes for housekeeping.
 * ⚠️ Only runs while the Node.js process is alive (local dev).
 * On Vercel serverless, each function instance is short-lived so the
 * in-memory Map is ephemeral anyway — memory leakage is not a concern.
 * For production multi-instance rate limiting, use Upstash Redis + @upstash/ratelimit.
 */
if (typeof setInterval !== "undefined") {
  const pruneTimer = setInterval(() => {
    apiLimiter.prune();
    strictLimiter.prune();
  }, 300_000);

  // Do not keep build workers or serverless instances alive solely for cleanup.
  if (typeof pruneTimer === "object" && "unref" in pruneTimer) {
    pruneTimer.unref();
  }
}
