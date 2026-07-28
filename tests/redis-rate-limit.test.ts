/**
 * Unit tests for RedisRateLimiter.
 *
 * Strategy:
 *   - Mock @upstash/redis to simulate Redis INCR/EXPIRE responses
 *     without a real network connection.
 *   - Use _resetRedisClient() (exported from redis-rate-limit) to
 *     reset the module-level _redis singleton between test suites.
 *   - Set/clear UPSTASH_REDIS_REST_URL env vars to toggle between
 *     the Redis code path and the in-memory fallback.
 *   - Dynamic imports ensure fresh module state per test suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock @upstash/redis ─────────────────────────────────────────
const mockIncr = vi.fn();
const mockExpire = vi.fn();

vi.mock("@upstash/redis", () => {
  // Use class syntax so `new Redis(...)` works (avoid "not a constructor")
  return {
    Redis: class MockRedis {
      incr = mockIncr;
      expire = mockExpire;
    },
  };
});

// ── Helpers ──────────────────────────────────────────────────────
function setRedisEnv(set: boolean): void {
  if (set) {
    process.env.UPSTASH_REDIS_REST_URL = "https://mock.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";
  } else {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
}

// ── Tests: Redis-backed path ─────────────────────────────────────

describe("RedisRateLimiter (Redis backend)", () => {
  let RedisRateLimiter: typeof import("@/lib/redis-rate-limit")["RedisRateLimiter"];
  let reset: typeof import("@/lib/redis-rate-limit")["_resetRedisClient"];

  beforeEach(async () => {
    setRedisEnv(true);
    mockIncr.mockReset();
    mockExpire.mockReset();

    // Dynamic import so module-level _redis is fresh
    const mod = await import("@/lib/redis-rate-limit");
    RedisRateLimiter = mod.RedisRateLimiter;
    reset = mod._resetRedisClient;
    reset(); // clear _redis singleton before each test
  });

  afterEach(() => {
    setRedisEnv(false);
  });

  it("isAvailable() returns true when env vars are set", () => {
    expect(RedisRateLimiter.isAvailable()).toBe(true);
  });

  it("allows requests within the limit", async () => {
    mockIncr.mockResolvedValue(1); // first request → count = 1
    mockExpire.mockResolvedValue(1);

    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });
    const result = await limiter.check("key-1");

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
    expect(result.remaining).toBe(2);
    expect(mockIncr).toHaveBeenCalledTimes(1);
    // First request should set expiry
    expect(mockExpire).toHaveBeenCalledTimes(1);
  });

  it("blocks requests exceeding the limit", async () => {
    // Simulate 4th request exceeding max of 3
    mockIncr.mockResolvedValue(4);
    mockExpire.mockResolvedValue(1);

    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });
    const result = await limiter.check("key-1");

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(4);
    expect(result.remaining).toBe(0);
    // count !== 1 so no expire call
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("tracks remaining count correctly", async () => {
    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });

    mockIncr.mockResolvedValueOnce(1);
    mockIncr.mockResolvedValueOnce(2);
    mockIncr.mockResolvedValueOnce(3);
    mockIncr.mockResolvedValueOnce(4);

    expect((await limiter.check("key")).remaining).toBe(2);
    expect((await limiter.check("key")).remaining).toBe(1);
    expect((await limiter.check("key")).remaining).toBe(0);
    expect((await limiter.check("key")).remaining).toBe(0);
  });

  it("returns correct resetInMs", async () => {
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);

    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });
    const result = await limiter.check("key");

    expect(result.resetInMs).toBeGreaterThan(0);
    expect(result.resetInMs).toBeLessThanOrEqual(60_000);
  });

  it("sets expiry only on first request in window", async () => {
    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });

    mockIncr.mockResolvedValueOnce(1);
    mockIncr.mockResolvedValueOnce(2);
    mockIncr.mockResolvedValueOnce(3);

    await limiter.check("key");
    expect(mockExpire).toHaveBeenCalledTimes(1);

    await limiter.check("key");
    expect(mockExpire).toHaveBeenCalledTimes(1);

    await limiter.check("key");
    expect(mockExpire).toHaveBeenCalledTimes(1);
  });

  it("uses separate keys per unique key argument", async () => {
    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });

    mockIncr.mockResolvedValueOnce(1);
    mockIncr.mockResolvedValueOnce(1);
    mockIncr.mockResolvedValueOnce(2);
    mockIncr.mockResolvedValueOnce(3);
    mockIncr.mockResolvedValueOnce(2);

    expect((await limiter.check("key-a")).allowed).toBe(true);
    expect((await limiter.check("key-b")).allowed).toBe(true);
    expect((await limiter.check("key-a")).allowed).toBe(true);
    expect((await limiter.check("key-a")).allowed).toBe(true);
    expect((await limiter.check("key-b")).allowed).toBe(true);
  });

  it("handles maxRequests = 1", async () => {
    const limiter = new RedisRateLimiter({ maxRequests: 1, windowMs: 60_000 });

    mockIncr.mockResolvedValueOnce(1);
    mockIncr.mockResolvedValueOnce(2);

    expect((await limiter.check("key")).allowed).toBe(true);
    expect((await limiter.check("key")).allowed).toBe(false);
  });
});

// ── Tests: in-memory fallback path ───────────────────────────────

describe("RedisRateLimiter (in-memory fallback)", () => {
  let RedisRateLimiter: typeof import("@/lib/redis-rate-limit")["RedisRateLimiter"];
  let reset: typeof import("@/lib/redis-rate-limit")["_resetRedisClient"];

  beforeEach(async () => {
    setRedisEnv(false);
    const mod = await import("@/lib/redis-rate-limit");
    RedisRateLimiter = mod.RedisRateLimiter;
    reset = mod._resetRedisClient;
    reset();
  });

  it("isAvailable() returns false when env vars are not set", () => {
    expect(RedisRateLimiter.isAvailable()).toBe(false);
  });

  it("allows requests within the limit", async () => {
    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });

    expect((await limiter.check("key-1")).allowed).toBe(true);
    expect((await limiter.check("key-1")).allowed).toBe(true);
    expect((await limiter.check("key-1")).allowed).toBe(true);
  });

  it("blocks requests exceeding the limit", async () => {
    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });

    await limiter.check("key-1");
    await limiter.check("key-1");
    await limiter.check("key-1");
    const result = await limiter.check("key-1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.current).toBe(4);
  });

  it("tracks remaining count", async () => {
    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });

    expect((await limiter.check("key-1")).remaining).toBe(2);
    expect((await limiter.check("key-1")).remaining).toBe(1);
    expect((await limiter.check("key-1")).remaining).toBe(0);
    expect((await limiter.check("key-1")).remaining).toBe(0);
  });

  it("uses separate windows per key", async () => {
    const limiter = new RedisRateLimiter({ maxRequests: 2, windowMs: 60_000 });

    await limiter.check("key-a");
    await limiter.check("key-a");
    expect((await limiter.check("key-a")).allowed).toBe(false);

    expect((await limiter.check("key-b")).allowed).toBe(true);
  });

  it("resets after window expires (fake timers)", async () => {
    vi.useFakeTimers();
    const limiter = new RedisRateLimiter({ maxRequests: 2, windowMs: 10_000 });

    await limiter.check("key");
    await limiter.check("key");
    expect((await limiter.check("key")).allowed).toBe(false);

    vi.advanceTimersByTime(10_001);
    expect((await limiter.check("key")).allowed).toBe(true);

    vi.useRealTimers();
  });

  it("returns correct resetInMs", async () => {
    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });

    const r1 = await limiter.check("key-1");
    expect(r1.resetInMs).toBeGreaterThan(0);
    expect(r1.resetInMs).toBeLessThanOrEqual(60_000);
  });

  it("tracks current count", async () => {
    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });

    expect((await limiter.check("key-1")).current).toBe(1);
    expect((await limiter.check("key-1")).current).toBe(2);
    expect((await limiter.check("key-1")).current).toBe(3);
    expect((await limiter.check("key-1")).current).toBe(4);
  });

  it("handles maxRequests = 1", async () => {
    const limiter = new RedisRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    expect((await limiter.check("key")).allowed).toBe(true);
    expect((await limiter.check("key")).allowed).toBe(false);
  });
});

// ── Tests: edge cases (Redis) ────────────────────────────────────

describe("RedisRateLimiter edge cases", () => {
  let RedisRateLimiter: typeof import("@/lib/redis-rate-limit")["RedisRateLimiter"];
  let reset: typeof import("@/lib/redis-rate-limit")["_resetRedisClient"];

  beforeEach(async () => {
    setRedisEnv(true);
    mockIncr.mockReset();
    mockExpire.mockReset();
    const mod = await import("@/lib/redis-rate-limit");
    RedisRateLimiter = mod.RedisRateLimiter;
    reset = mod._resetRedisClient;
    reset();
  });

  afterEach(() => {
    setRedisEnv(false);
  });

  it("handles rapid concurrent requests gracefully", async () => {
    mockIncr
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);

    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });

    const results = await Promise.all([
      limiter.check("key"),
      limiter.check("key"),
      limiter.check("key"),
    ]);

    const allowed = results.filter((r) => r.allowed);
    expect(allowed.length).toBe(3);
  });

  it("handles Redis returning string count (edge case)", async () => {
    // Redis INCR returns number but some SDKs may return string
    mockIncr.mockResolvedValue("1");
    mockExpire.mockResolvedValue(1);

    const limiter = new RedisRateLimiter({ maxRequests: 3, windowMs: 60_000 });
    const result = await limiter.check("key");

    // The count may be coerced - just ensure it doesn't throw
    expect(result).toHaveProperty("allowed");
  });
});
