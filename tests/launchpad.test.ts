/**
 * Integration tests for the launchpad aggregation layer.
 *
 * Most tests use the CACHED path (`getCachedLaunchpadTokens`) which reads
 * from Redis/shared cache without hitting live APIs — fast and stable in
 * CI. One test exercises a live public API (lemon.fun, no key) to prove
 * the adapter works end-to-end; 01.exchange is key-gated and skipped.
 *
 * Run with: npx vitest run tests/launchpad.test.ts
 */

import { describe, it, expect } from "vitest";
import { getLaunchpadFeed } from "@/lib/aggregate";
import { getCachedLaunchpadTokens } from "@/lib/sources/launchpad";
import { implementedLaunchpads } from "@/lib/sources/launchpad/registry";
import { fetchLemonTokens } from "@/lib/sources/launchpad/lemon";
import { launchpadTokenToTrackedPair, isGraduated } from "@/lib/sources/launchpad/to-tracked-pair";
import type { LaunchpadToken } from "@/lib/sources/launchpad/types";

const NETWORK_TIMEOUT = 30_000;

describe("Launchpad — Integration (cached path)", () => {
  it("cached tokens are well-formed and unique", async () => {
    const tokens = await getCachedLaunchpadTokens();

    expect(Array.isArray(tokens)).toBe(true);
    const ids = new Set<string>();
    const addresses = new Set<string>();

    for (const t of tokens) {
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

    expect(ids.size).toBe(tokens.length);
    expect(addresses.size).toBe(tokens.length);
  }, 10_000);

  it("getLaunchpadFeed returns a well-formed response even with empty cache", async () => {
    const result = await getLaunchpadFeed();

    expect(result).toHaveProperty("updatedAt");
    expect(result.chain.id).toBe("robinhood");
    expect(result.chain.chainId).toBe(4663);
    expect(Array.isArray(result.sources)).toBe(true);
    expect(Array.isArray(result.tokens)).toBe(true);
    expect(result.count).toBe(result.tokens.length);
    expect(typeof result.recommendedRefreshMs).toBe("number");
    expect(result.recommendedRefreshMs).toBeGreaterThan(0);
  }, 10_000);

  it("implemented platforms are registered in the registry", () => {
    const names = implementedLaunchpads().map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["Lemon", "Bankr", "Pools.trade", "Sushi", "01.exchange", "Pons", "Bow"])
    );
  });

  it("graduated tokens convert to valid TrackedPair", async () => {
    const tokens = await getCachedLaunchpadTokens();
    const graduated = tokens.filter(isGraduated);

    for (const t of graduated) {
      const pair = launchpadTokenToTrackedPair(t);
      expect(pair.tokenAddress).toBe(t.tokenAddress);
      expect(pair.symbol).toBe(t.symbol);
      expect(pair.dexName).toBe(t.platformName);
      expect(pair.sources).toContain("launchpad");
      expect(pair.links.launchpad).toBeTruthy();
      expect(pair.id.startsWith("lp:")).toBe(true);
    }
  }, 10_000);
});

describe("Launchpad — Live API (lemon.fun, no key)", () => {
  it("fetchLemonTokens returns normalized tokens", async () => {
    const tokens = await fetchLemonTokens(10);

    expect(Array.isArray(tokens)).toBe(true);
    expect(tokens.length).toBeLessThanOrEqual(10);
    for (const t of tokens as LaunchpadToken[]) {
      expect(t.tokenAddress).toMatch(/^0x[a-f0-9]+$/);
      expect(t.platform).toBe("lemon");
      expect(t.id.startsWith("lemon:")).toBe(true);
    }
  }, NETWORK_TIMEOUT);
});
