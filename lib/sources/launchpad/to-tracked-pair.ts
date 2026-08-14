/**
 * Convert a normalized `LaunchpadToken` into the project's `TrackedPair`
 * shape so launchpad tokens can flow into the existing trending feed
 * (Kombinasi approach) and reuse PairTable/PairCardView rendering.
 */

import type { TrackedPair } from "../../types";
import { buildExternalLinks } from "../shared";
import { launchpadInfo } from "./registry";
import type { LaunchpadToken } from "./types";

export function launchpadTokenToTrackedPair(t: LaunchpadToken): TrackedPair {
  const pair = t.pairAddress ?? "";
  const platform = launchpadInfo(t.platform);
  const platformUrl = platform?.url ?? "https://lemon.fun";

  const links = buildExternalLinks(pair, t.tokenAddress, "launchpad");
  links.launchpad = `${platformUrl}/token/${t.tokenAddress}`;

  return {
    id: `lp:${t.tokenAddress}`,
    pairAddress: pair,
    tokenAddress: t.tokenAddress,
    name: t.name,
    symbol: t.symbol,
    quoteSymbol: t.quoteSymbol ?? "WETH",
    dexId: "launchpad",
    dexName: t.platformName,
    priceUsd: t.priceUsd,
    priceNative: null,
    liquidityUsd: t.liquidityUsd,
    volume5m: null,
    volume1h: null,
    volume6h: null,
    volume24h: t.volume24hUsd,
    priceChange5m: null,
    priceChange1h: null,
    priceChange6h: null,
    priceChange24h: null,
    txns5m: null,
    txns1h: null,
    txns24h: null,
    buys5m: null,
    sells5m: null,
    buys1h: null,
    sells1h: null,
    fdv: t.fdvUsd,
    marketCap: t.marketCapUsd,
    pairCreatedAt: t.launchTimeMs,
    ageMs: t.ageMs,
    imageUrl: t.imageUrl,
    sources: ["launchpad"],
    links,
    description: t.description,
    socials: t.socials,
    boosted: false,
  };
}

/** True when a launchpad token has a real AMM pool (eligible for trending merge). */
export function isGraduated(t: LaunchpadToken): boolean {
  return t.phase === "graduated" && !!t.pairAddress;
}
