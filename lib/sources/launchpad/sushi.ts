/**
 * SushiSwap Launchpad adapter — public GraphQL API, no key required.
 *
 * Docs: https://docs.sushi.com/launchpad/integrators
 * Endpoint: https://production.data-gcp.sushi.com/api (POST only)
 * Query used:
 *   launchpad.tokens(chainId: 4663, sortBy: CREATED_AT, sortDirection: DESC)
 * Sushi Launchpad = locked SushiSwap V3 (1%) pool from launch → "graduated".
 */

import { fetchJsonCached, parseMaybeNumber } from "../shared";
import { launchpadInfo } from "./registry";
import type { LaunchpadToken } from "./types";

const ENDPOINT = "https://production.data-gcp.sushi.com/api";
const CACHE_TTL_MS = 30_000;
const CHAIN_ID = 4663;

/** GraphQL response shape (only the fields we consume). */
interface SushiGraphResponse {
  data?: {
    launchpad?: {
      tokens?: SushiRawToken[];
    };
  };
  errors?: { message?: string }[];
}

interface SushiRawToken {
  id?: string;
  address?: string;
  token?: { address?: string; name?: string; symbol?: string; imageUrl?: string };
  name?: string;
  symbol?: string;
  logo?: string;
  imageUrl?: string;
  description?: string;
  priceUsd?: number | string;
  fdvUsd?: number | string;
  tvlUsd?: number | string;
  volume?: {
    h1?: number | string;
    h6?: number | string;
    h12?: number | string;
    h24?: number | string;
  };
  liquidity?: number | string;
  marketCapUsd?: number | string;
  createdAt?: number | string;
  createdAtTimestamp?: number | string;
  timestamp?: number | string;
  pool?: { address?: string; feeTier?: number | string; quoteToken?: { symbol?: string } };
  pairAddress?: string;
  holders?: number;
  feeSplit?: string;
  quoteSymbol?: string;
  socials?: { type?: string; url?: string }[];
  isStale?: boolean;
}

function toMs(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Sushi may return seconds (10-digit) or ms (13-digit).
  return n < 1e12 ? n * 1000 : n;
}

function mapSushiToken(raw: SushiRawToken): LaunchpadToken | null {
  const tokenAddress = (raw.address || raw.token?.address || "").toLowerCase();
  if (!tokenAddress || tokenAddress === "0x") return null;

  const launchTimeMs = toMs(raw.createdAt ?? raw.createdAtTimestamp ?? raw.timestamp);
  const pairAddress =
    (raw.pool?.address || raw.pairAddress || "").toLowerCase() || null;
  const quoteSymbol =
    raw.pool?.quoteToken?.symbol || raw.quoteSymbol || "WETH";
  const platform = launchpadInfo("sushi");

  return {
    id: `sushi:${tokenAddress}`,
    platform: "sushi",
    platformName: platform?.name ?? "Sushi",
    tokenAddress,
    pairAddress,
    name: raw.name || raw.token?.name || raw.symbol || "Unknown",
    symbol: raw.symbol || raw.token?.symbol || "???",
    phase: "graduated",
    priceUsd: parseMaybeNumber(raw.priceUsd),
    fdvUsd: parseMaybeNumber(raw.fdvUsd),
    marketCapUsd: parseMaybeNumber(raw.marketCapUsd),
    liquidityUsd: parseMaybeNumber(raw.tvlUsd ?? raw.liquidity),
    volume24hUsd: parseMaybeNumber(raw.volume?.h24 ?? raw.volume?.h12 ?? raw.volume?.h6 ?? raw.volume?.h1),
    launchTimeMs,
    ageMs: launchTimeMs != null ? Date.now() - launchTimeMs : null,
    imageUrl: raw.logo || raw.imageUrl || raw.token?.imageUrl || null,
    description: raw.description || null,
    socials: (raw.socials || [])
      .map((s) => ({ type: s.type || "link", url: s.url || "" }))
      .filter((s) => s.url),
    graduationProgressPct: null,
    thresholdQuote: null,
    devBuyUsd: null,
    holders: typeof raw.holders === "number" ? raw.holders : null,
    feeSplit: raw.feeSplit || null,
    taxRateBps: null,
    lockedLiquidity: true,
    quoteSymbol: quoteSymbol || "WETH",
  };
}

const TOKENS_QUERY = `
  query LaunchpadTokens($chainId: Int!) {
    launchpad {
      tokens(input: {
        chainId: $chainId
        sortBy: CREATED_AT
        sortDirection: DESC
      }) {
        id
        address
        name
        symbol
        imageUrl
        description
        priceUsd
        fdvUsd
        tvlUsd
        volume {
          h1
          h6
          h12
          h24
        }
        createdAt
        holders
        pool {
          address
          feeTier
          quoteToken { symbol }
        }
      }
    }
  }
`;

/**
 * Fetch the most recent SushiSwap Launchpad tokens on Robinhood Chain.
 */
export async function fetchSushiLaunchpadTokens(): Promise<LaunchpadToken[]> {
  return fetchJsonCached<SushiGraphResponse>(
    ENDPOINT,
    {
      cacheKey: `launchpad:sushi:${CHAIN_ID}`,
      ttlMs: CACHE_TTL_MS,
      method: "POST",
      body: JSON.stringify({
        query: TOKENS_QUERY,
        variables: { chainId: CHAIN_ID },
      }),
      headers: { "Content-Type": "application/json" },
    }
  ).then((json) => {
    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message || "GraphQL error").join("; ");
      throw new Error(`Sushi GraphQL: ${msg}`);
    }
    const list = json.data?.launchpad?.tokens || [];
    return list
      .map(mapSushiToken)
      .filter((t): t is LaunchpadToken => t !== null);
  });
}
