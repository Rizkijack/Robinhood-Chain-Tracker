/**
 * Integration tests for the aggregation layer.
 *
 * These tests verify that getTrendingFeed(), getNewPairsFeed(), and getStats()
 * return well-formed FeedResponse / StatsResponse objects even when some
 * external sources are unavailable (network errors, missing API keys, etc.).
 *
 * The tests use real network calls to public APIs (DexScreener, GeckoTerminal)
 * which are keyless. Birdeye/CoinGecko/CoinMarketCap are skipped when their
 * API keys are not configured.
 *
 * Run with: npx vitest run tests/aggregate.test.ts
 */

import { describe, it, expect, vi } from "vitest";
import { getTrendingFeed, getNewPairsFeed, getBoostsFeed, getStats } from "@/lib/aggregate";

// Timeout for network-dependent tests
const NETWORK_TIMEOUT = 30_000;

describe("Aggregate Layer — Integration", () => {
  describe("getNewPairsFeed", () => {
    it("returns a well-formed FeedResponse", async () => {
      const result = await getNewPairsFeed();

      expect(result).toHaveProperty("updatedAt");
      expect(result).toHaveProperty("chain");
      expect(result.chain.id).toBe("robinhood");
      expect(result.chain.chainId).toBe(4663);
      expect(result).toHaveProperty("sources");
      expect(result).toHaveProperty("count");
      expect(result).toHaveProperty("pairs");
      expect(Array.isArray(result.pairs)).toBe(true);
      expect(result.count).toBe(result.pairs.length);
      expect(typeof result.recommendedRefreshMs).toBe("number");
      expect(result.recommendedRefreshMs).toBeGreaterThan(0);
    }, NETWORK_TIMEOUT);

    it("each pair has required fields", async () => {
      const result = await getNewPairsFeed();

      for (const pair of result.pairs) {
        expect(pair).toHaveProperty("id");
        expect(pair).toHaveProperty("tokenAddress");
        expect(pair).toHaveProperty("name");
        expect(pair).toHaveProperty("symbol");
        expect(pair).toHaveProperty("sources");
        expect(Array.isArray(pair.sources)).toBe(true);
        expect(pair.sources.length).toBeGreaterThan(0);
        // priceUsd can be null (some sources don't provide it)
        expect(pair.priceUsd === null || typeof pair.priceUsd === "number").toBe(true);
        expect(pair.liquidityUsd === null || typeof pair.liquidityUsd === "number").toBe(true);
      }
    }, NETWORK_TIMEOUT);
  });

  describe("getTrendingFeed", () => {
    it("returns a well-formed FeedResponse", async () => {
      const result = await getTrendingFeed();

      expect(result).toHaveProperty("updatedAt");
      expect(result.chain.id).toBe("robinhood");
      expect(result).toHaveProperty("sources");
      expect(result).toHaveProperty("count");
      expect(result).toHaveProperty("pairs");
      expect(Array.isArray(result.pairs)).toBe(true);
      expect(result.count).toBe(result.pairs.length);
      expect(typeof result.recommendedRefreshMs).toBe("number");
    }, NETWORK_TIMEOUT);

    it("pairs are sorted by volume (descending)", async () => {
      const result = await getTrendingFeed();

      // Check that the first pair has volume >= the last pair (if both have volume)
      if (result.pairs.length >= 2) {
        const firstVol = result.pairs[0].volume1h || result.pairs[0].volume24h || 0;
        const lastVol = result.pairs[result.pairs.length - 1].volume1h ||
          result.pairs[result.pairs.length - 1].volume24h || 0;
        expect(firstVol).toBeGreaterThanOrEqual(lastVol);
      }
    }, NETWORK_TIMEOUT);
  });

  describe("getBoostsFeed", () => {
    it("returns a well-formed FeedResponse", async () => {
      const result = await getBoostsFeed();

      expect(result).toHaveProperty("updatedAt");
      expect(result.chain.id).toBe("robinhood");
      expect(result).toHaveProperty("sources");
      expect(result).toHaveProperty("count");
      expect(result).toHaveProperty("pairs");
      expect(Array.isArray(result.pairs)).toBe(true);
    }, NETWORK_TIMEOUT);
  });

  describe("getStats", () => {
    it("returns a well-formed StatsResponse", async () => {
      const result = await getStats();

      expect(result).toHaveProperty("updatedAt");
      expect(result).toHaveProperty("newPairs");
      expect(result).toHaveProperty("trending");
      expect(result).toHaveProperty("profiles");
      expect(result).toHaveProperty("boosts");
      expect(result).toHaveProperty("dexes");
      expect(Array.isArray(result.dexes)).toBe(true);
      expect(result.dexes).toContain("DexScreener");
      expect(result.dexes).toContain("GeckoTerminal");
      expect(typeof result.newPairs).toBe("number");
      expect(typeof result.trending).toBe("number");
    }, NETWORK_TIMEOUT);

    it("includes keyMetrics when pairs are available", async () => {
      const result = await getStats();

      if (result.newPairs > 0 || result.trending > 0) {
        expect(result).toHaveProperty("keyMetrics");
        expect(result.keyMetrics).toBeDefined();
      }
    }, NETWORK_TIMEOUT);
  });

  describe("Error handling", () => {
    it("getTrendingFeed includes errors array when sources fail", async () => {
      const result = await getTrendingFeed();

      // errors is optional — only present when something fails
      if (result.errors) {
        expect(Array.isArray(result.errors)).toBe(true);
        for (const err of result.errors) {
          expect(err).toHaveProperty("source");
          expect(err).toHaveProperty("message");
        }
      }
    }, NETWORK_TIMEOUT);

    it("getNewPairsFeed still returns data even if some sources fail", async () => {
      const result = await getNewPairsFeed();

      // Even with errors, should return a valid response structure
      expect(result).toHaveProperty("pairs");
      expect(result).toHaveProperty("count");
      expect(result.count).toBe(result.pairs.length);
    }, NETWORK_TIMEOUT);
  });
});
