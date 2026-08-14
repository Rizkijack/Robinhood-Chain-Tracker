/**
 * Integration tests for the launchpad aggregation layer.
 *
 * These tests hit the live public APIs of the Phase-1 launchpad platforms
 * (lemon.fun, Bankr, Sushi Launchpad, Pools.trade). 01.exchange is
 * key-gated and skipped when O1_EXCHANGE_API_KEY is not configured.
 *
 * Run with: npx vitest run tests/launchpad.test.ts
 */

import { describe, it, expect } from "vitest";
import { getLaunchpadFeed } from "@/lib/aggregate";
import { fetchLaunchpadTokens } from "@/lib/sources/launchpad";
import { implementedLaunchpads } from "@/lib/sources/launchpad/registry";
import { launchpadTokenToTrackedPair, isGraduated } from "@/lib/sources/launchpad/to-tracked-pair";

const NETWORK_TIMEOUT = 30_000;

describe("Launchpad — Integration", () => {
  it("returns a well-formed LaunchpadFeedResponse", async () => {
    const result = await getLaunchpadFeed();

    expect(result).toHaveProperty("updatedAt");
    expect(result.chain.id).toBe("robinhood");
    expect(result.chain.chainId).toBe(4663);
    expect(Array.isArray(result.sources)).toBe(true);
    expect(Array.isArray(result.tokens)).toBe(true);
    expect(result.count).toBe(result.tokens.length);
    expect(typeof result.recommendedRefreshMs).toBe("number");
    expect(result.recommendedRefreshMs).toBeGreaterThan(0);
  }, NETWORK_TIMEOUT);

  it("each token has required fields and unique ids", async () => {
    const result = await getLaunchpadFeed();
    const ids = new Set<string>();
    const addresses = new Set<string>();

    for (const t of result.tokens) {
      expect(t.id).toBeTruthy();
      expect(t.tokenAddress).toMatch(/^0x[a-f0-9]+$/);
      expect(t.name).toBeTruthy();
      expect(t.symbol).toBeTruthy();
      expect(["bonding", "auction", "graduated"]).toContain(t.phase);
      expect(typeof t.platformName).toBe("string");
      expect(t.priceUsd === null || typeof t.priceUsd === "number").toBe(true);
      expect(t.liquidityUsd === null || typeof t.liquidityUsd === "number").toBe(true);

      ids.add(t.id);
      addresses.add(t.tokenAddress);
    }

    // No duplicate ids or token addresses after merge.
    expect(ids.size).toBe(result.tokens.length);
    expect(addresses.size).toBe(result.tokens.length);
  }, NETWORK_TIMEOUT);

  it("platform names in sources match the registry", async () => {
    const result = await getLaunchpadFeed();
    const implemented = implementedLaunchpads().map((p) => p.name);
    // All reported sources must be implemented platforms.
    for (const s of result.sources) {
      expect(implemented).toContain(s);
    }
  }, NETWORK_TIMEOUT);

  it("error entries (if any) have platform + message", async () => {
    const result = await getLaunchpadFeed();
    if (result.errors?.length) {
      for (const e of result.errors) {
        expect(typeof e.platform).toBe("string");
        expect(typeof e.message).toBe("string");
      }
    }
  }, NETWORK_TIMEOUT);

  it("graduated tokens convert to valid TrackedPair", async () => {
    const feed = await fetchLaunchpadTokens();
    const graduated = feed.tokens.filter(isGraduated);

    for (const t of graduated) {
      const pair = launchpadTokenToTrackedPair(t);
      expect(pair.tokenAddress).toBe(t.tokenAddress);
      expect(pair.symbol).toBe(t.symbol);
      expect(pair.dexName).toBe(t.platformName);
      expect(pair.sources).toContain("launchpad");
      expect(pair.links.launchpad).toBeTruthy();
      expect(pair.id.startsWith("lp:")).toBe(true);
    }
  }, NETWORK_TIMEOUT);
});
