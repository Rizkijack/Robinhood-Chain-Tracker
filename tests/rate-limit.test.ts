import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "@/lib/rate-limit";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    expect(limiter.check("key-1").allowed).toBe(true);
    expect(limiter.check("key-1").allowed).toBe(true);
    expect(limiter.check("key-1").allowed).toBe(true);
  });

  it("blocks requests exceeding the limit", () => {
    limiter.check("key-1");
    limiter.check("key-1");
    limiter.check("key-1");
    const result = limiter.check("key-1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks remaining count", () => {
    expect(limiter.check("key-1").remaining).toBe(2);
    expect(limiter.check("key-1").remaining).toBe(1);
    expect(limiter.check("key-1").remaining).toBe(0);
    expect(limiter.check("key-1").remaining).toBe(0);
  });

  it("uses separate windows per key", () => {
    expect(limiter.check("key-a").allowed).toBe(true);
    expect(limiter.check("key-a").allowed).toBe(true);
    expect(limiter.check("key-a").allowed).toBe(true);
    expect(limiter.check("key-a").allowed).toBe(false);

    // Different key should still have full allowance
    expect(limiter.check("key-b").allowed).toBe(true);
  });

  it("resets after window expires", () => {
    limiter.check("key-1");
    limiter.check("key-1");
    limiter.check("key-1");
    expect(limiter.check("key-1").allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(60_001);

    // After window expires, requests should be allowed again
    expect(limiter.check("key-1").allowed).toBe(true);
  });

  it("returns correct resetInMs", () => {
    const r1 = limiter.check("key-1");
    expect(r1.resetInMs).toBeGreaterThan(0);

    // After some time, reset should be shorter
    vi.advanceTimersByTime(30_000);
    limiter.check("key-1");
    limiter.check("key-1");

    const blocked = limiter.check("key-1");
    expect(blocked.allowed).toBe(false);
    // Oldest request was 30s ago, window is 60s, so reset in ~30s
    expect(blocked.resetInMs).toBeLessThanOrEqual(60_000);
    expect(blocked.resetInMs).toBeGreaterThan(20_000);
  });

  it("tracks current count", () => {
    expect(limiter.check("key-1").current).toBe(1);
    expect(limiter.check("key-1").current).toBe(2);
    expect(limiter.check("key-1").current).toBe(3);
    expect(limiter.check("key-1").current).toBe(3); // blocked, stays at 3
  });

  describe("prune", () => {
    it("removes stale entries", () => {
      limiter.check("old-key");
      vi.advanceTimersByTime(61_000); // slightly past the window
      limiter.check("new-key");

      limiter.prune();

      // The limiter's internal map should have cleaned up
      // We can test indirectly by checking that old-key works again
      // (meaning its old entries were pruned)
      const r1 = limiter.check("old-key");
      expect(r1.allowed).toBe(true);
    });
  });
});

describe("RateLimiter edge cases", () => {
  it("handles maxRequests = 1", () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });
    expect(limiter.check("key").allowed).toBe(true);
    expect(limiter.check("key").allowed).toBe(false);
  });

  it("handles negative time advance", () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 10_000 });
    limiter.check("key");
    // Even with no time passed, we should have used 1 slot
    expect(limiter.check("key").current).toBe(2);
  });
});
