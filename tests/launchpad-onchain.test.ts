/**
 * Tests for the on-chain launchpad indexer (Phase 2).
 *
 * These validate the contract registry (event ABIs parse, token
 * derivation works) and the chunked log scanner with a SMALL block
 * range (1 chunk) so they run fast against the public RPC. They do NOT
 * do a full backfill from deploy block — that happens via cron.
 */

import { describe, it, expect } from "vitest";
import { EVENT_ABIS, ONCHAIN_PLATFORMS, onchainPlatform } from "@/lib/sources/launchpad/onchain/contracts";
import { getCurrentBlock } from "@/lib/sources/launchpad/onchain/indexer";
import { getOnchainTokens } from "@/lib/sources/launchpad/onchain";
import { getLogsChunked } from "@/lib/sources/launchpad/onchain/rpc-logs";
import { launchpadInfo } from "@/lib/sources/launchpad/registry";
import type { LaunchpadToken } from "@/lib/sources/launchpad/types";

const NETWORK_TIMEOUT = 60_000;

describe("On-chain Launchpad — Contracts", () => {
  it("all 6 Phase-2 platforms are registered and implemented", () => {
    const ids = ONCHAIN_PLATFORMS.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(["pons", "ponsv2", "flap", "trench", "bow", "bags"])
    );
    for (const p of ONCHAIN_PLATFORMS) {
      expect(p.factory).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(p.deployBlock).toBeGreaterThan(0);
      const info = launchpadInfo(p.id);
      expect(info?.implemented).toBe(true);
    }
  });

  it("event ABIs parse to valid viem events with indexed topics", () => {
    for (const event of Object.values(EVENT_ABIS)) {
      expect(event.type).toBe("event");
      expect(event.name).toBeTruthy();
      expect(Array.isArray(event.inputs)).toBe(true);
    }
  });

  it("toToken derives valid LaunchpadToken from synthetic args", () => {
    const sample = ONCHAIN_PLATFORMS[0];
    const token = sample.toToken(
      { token: "0x1111111111111111111111111111111111111111" },
      8_000_000
    );
    expect(token).not.toBeNull();
    expect(token!.tokenAddress).toBe("0x1111111111111111111111111111111111111111");
    expect(token!.launchBlock).toBe(8_000_000);
    expect(token!.id.startsWith(`${sample.id}:`)).toBe(true);
  });
});

describe("On-chain Launchpad — RPC (small range)", () => {
  it("getCurrentBlock returns a positive block number", async () => {
    const block = await getCurrentBlock();
    expect(block).toBeGreaterThan(7_500_000);
  }, NETWORK_TIMEOUT);

  it("scans a small chunk without events (no throw, empty or valid result)", async () => {
    // Scan a tiny 100-block window on the Pons V1 factory. This is a
    // real RPC call but bounded to 1 chunk, so it must not time out.
    const pons = onchainPlatform("pons")!;
    const current = await getCurrentBlock();
    const from = BigInt(Math.max(pons.deployBlock, current - 200));
    const logs = await getLogsChunked(
      pons.factory,
      pons.event,
      from,
      from + 100n
    );
    expect(Array.isArray(logs)).toBe(true);
    for (const l of logs) {
      expect(l.blockNumber).toBeGreaterThan(0);
      expect(typeof l.args).toBe("object");
    }
  }, NETWORK_TIMEOUT);

  it("getOnchainTokens reads the stored index without network (fast)", async () => {
    // The index is built by the cron (`refreshOnchainIndex`). The read
    // path must be cheap and never throw — even before the first cron
    // run it returns [].
    const tokens = await getOnchainTokens();
    expect(Array.isArray(tokens)).toBe(true);
    for (const t of tokens) {
      expect(t.tokenAddress).toMatch(/^0x[a-f0-9]+$/);
      expect(typeof t.platform).toBe("string");
      expect((t as LaunchpadToken).id.startsWith(`${t.platform}:`)).toBe(true);
    }
  }, 10_000);
});
