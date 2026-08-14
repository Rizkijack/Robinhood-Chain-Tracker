/**
 * Launchpad data source aggregator.
 *
 * Runs every implemented platform adapter (Phase 1) in parallel via
 * `Promise.allSettled`, collects per-platform errors, merges tokens by
 * token address (preferring the `graduated` phase when the same token
 * appears from two sources), and returns a normalized feed.
 *
 * Platform failures never break the feed — a dead adapter contributes
 * `[]` + an entry in `errors`.
 */

import { CHAIN, SOURCE_TIMING, recommendedClientRefreshMs } from "../../constants";
import { fetchBankrTokens } from "./bankr";
import { fetchLemonTokens } from "./lemon";
import { fetchO1ExchangeTokens } from "./o1exchange";
import { fetchPoolsTradeTokens } from "./poolstrade";
import { implementedLaunchpads } from "./registry";
import { fetchSushiLaunchpadTokens } from "./sushi";
import type { LaunchpadFeedResponse, LaunchpadToken } from "./types";

type Fetcher = () => Promise<LaunchpadToken[]>;

/** Ordered list of Phase-1 adapters. */
const ADAPTERS: { id: string; fetch: Fetcher }[] = [
  { id: "lemon", fetch: () => fetchLemonTokens(200) },
  { id: "bankr", fetch: () => fetchBankrTokens() },
  { id: "poolstrade", fetch: () => fetchPoolsTradeTokens() },
  { id: "sushi", fetch: () => fetchSushiLaunchpadTokens() },
  { id: "o1exchange", fetch: () => fetchO1ExchangeTokens(100) },
];

/** Merge two entries for the same token address — prefer `graduated`. */
function mergeTokens(a: LaunchpadToken, b: LaunchpadToken): LaunchpadToken {
  const phaseOrder = { bonding: 0, auction: 1, graduated: 2 } as const;
  const pickPhase =
    phaseOrder[b.phase] > phaseOrder[a.phase] ? b.phase : a.phase;
  const pair = a.pairAddress || b.pairAddress;

  return {
    ...a,
    phase: pickPhase,
    pairAddress: pair,
    priceUsd: a.priceUsd ?? b.priceUsd,
    fdvUsd: a.fdvUsd ?? b.fdvUsd,
    marketCapUsd: a.marketCapUsd ?? b.marketCapUsd,
    liquidityUsd: a.liquidityUsd ?? b.liquidityUsd,
    volume24hUsd: a.volume24hUsd ?? b.volume24hUsd,
    graduationProgressPct: a.graduationProgressPct ?? b.graduationProgressPct,
    imageUrl: a.imageUrl || b.imageUrl,
    description: a.description || b.description,
    socials: a.socials.length ? a.socials : b.socials,
  };
}

export async function fetchLaunchpadTokens(): Promise<LaunchpadFeedResponse> {
  const errors: { platform: string; message: string }[] = [];
  const byAddress = new Map<string, LaunchpadToken>();

  const results = await Promise.allSettled(
    ADAPTERS.map((a) => a.fetch())
  );

  for (let i = 0; i < ADAPTERS.length; i++) {
    const r = results[i];
    const id = ADAPTERS[i].id;
    if (r.status === "rejected") {
      errors.push({ platform: id, message: String(r.reason).slice(0, 200) });
      continue;
    }
    for (const token of r.value) {
      const prev = byAddress.get(token.tokenAddress);
      byAddress.set(token.tokenAddress, prev ? mergeTokens(prev, token) : token);
    }
  }

  const tokens = [...byAddress.values()].sort(
    (a, b) => (b.launchTimeMs ?? 0) - (a.launchTimeMs ?? 0)
  );

  return {
    updatedAt: new Date().toISOString(),
    chain: {
      id: CHAIN.id,
      name: CHAIN.name,
      chainId: CHAIN.chainId,
      nativeGas: CHAIN.nativeGas,
    },
    sources: implementedLaunchpads().map((p) => p.name),
    count: tokens.length,
    tokens,
    errors: errors.length ? errors : undefined,
    recommendedRefreshMs: recommendedClientRefreshMs(),
  };
}

export function launchpadRefreshMs(): number {
  const ids = ADAPTERS.map((a) => a.id);
  const enabled = ids
    .map((id) => SOURCE_TIMING[id])
    .filter(Boolean)
    .map((t) => t.refreshMs);
  return enabled.length ? Math.min(...enabled) : 12_000;
}
