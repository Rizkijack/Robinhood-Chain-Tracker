/**
 * 01.exchange launchpad adapter — public REST API, key-gated.
 *
 * Docs: https://docs.o1.exchange/launchpad/api/introduction
 * Base: https://api.launch.o1.exchange/v1
 * Endpoints used:
 *   GET /tokens?chain_id=4663&sort=newest   → token list (key required)
 *   GET /tokens/{chain}/{addr}              → single token detail
 *
 * Requires `x-api-key` header. When O1_EXCHANGE_API_KEY is unset the
 * adapter silently returns [] (Birdeye pattern). A 401 also degrades
 * to [] so a bad key never breaks the feed.
 */

import { cached } from "../../cache";
import { env, parseMaybeNumber } from "../shared";
import { launchpadInfo } from "./registry";
import type { LaunchpadToken } from "./types";

const BASE = "https://api.launch.o1.exchange/v1";
const CACHE_TTL_MS = 30_000;
const CHAIN_ID = 4663;

interface O1RawToken {
  address?: string;
  tokenAddress?: string;
  name?: string;
  symbol?: string;
  logo?: string;
  imageUrl?: string;
  description?: string;
  decimals?: number;
  priceUsd?: number | string;
  marketCap?: number | string;
  fdv?: number | string;
  liquidity?: number | string;
  liquidityUsd?: number | string;
  volume24h?: number | string;
  createdAt?: number | string;
  created_at?: number | string;
  launchTime?: number | string;
  poolAddress?: string;
  pair?: string;
  holders?: number;
  feeSplit?: string;
  quoteSymbol?: string;
  phase?: string;
  graduationPct?: number | string;
  thresholdQuote?: number | string;
  socials?: { type?: string; url?: string }[];
}

function toMs(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

function mapO1Token(raw: O1RawToken): LaunchpadToken | null {
  const tokenAddress = (raw.address || raw.tokenAddress || "").toLowerCase();
  if (!tokenAddress || tokenAddress === "0x") return null;

  const launchTimeMs = toMs(raw.createdAt ?? raw.created_at ?? raw.launchTime);
  const platform = launchpadInfo("o1exchange");

  let phase: LaunchpadToken["phase"] = "graduated";
  if (raw.phase === "bonding" || raw.phase === "curve") phase = "bonding";
  else if (raw.phase === "auction") phase = "auction";

  return {
    id: `o1exchange:${tokenAddress}`,
    platform: "o1exchange",
    platformName: platform?.name ?? "01.exchange",
    tokenAddress,
    pairAddress: (raw.poolAddress || raw.pair || "").toLowerCase() || null,
    name: raw.name?.trim() || raw.symbol?.trim() || "Unknown",
    symbol: raw.symbol?.trim() || "???",
    phase,
    priceUsd: parseMaybeNumber(raw.priceUsd),
    fdvUsd: parseMaybeNumber(raw.fdv ?? raw.marketCap),
    marketCapUsd: parseMaybeNumber(raw.marketCap),
    liquidityUsd: parseMaybeNumber(raw.liquidityUsd ?? raw.liquidity),
    volume24hUsd: parseMaybeNumber(raw.volume24h),
    launchTimeMs,
    ageMs: launchTimeMs != null ? Date.now() - launchTimeMs : null,
    imageUrl: raw.logo || raw.imageUrl || null,
    description: raw.description || null,
    socials: (raw.socials || [])
      .map((s) => ({ type: s.type || "link", url: s.url || "" }))
      .filter((s) => s.url),
    graduationProgressPct: parseMaybeNumber(raw.graduationPct),
    thresholdQuote: parseMaybeNumber(raw.thresholdQuote),
    devBuyUsd: null,
    holders: typeof raw.holders === "number" ? raw.holders : null,
    feeSplit: raw.feeSplit || null,
    taxRateBps: null,
    lockedLiquidity: true,
    quoteSymbol: raw.quoteSymbol || null,
  };
}

interface O1TokensResponse {
  tokens?: O1RawToken[];
  data?: O1RawToken[];
}

/**
 * Fetch the most recent 01.exchange launchpad tokens on Robinhood Chain.
 * Returns [] when the API key is missing or rejected (401).
 */
export async function fetchO1ExchangeTokens(limit = 100): Promise<LaunchpadToken[]> {
  const apiKey = env("O1_EXCHANGE_API_KEY");
  if (!apiKey) return [];

  return cached(`launchpad:o1exchange:${limit}`, CACHE_TTL_MS, async () => {
    try {
      const url =
        `${BASE}/tokens?chain_id=${CHAIN_ID}&sort=newest&limit=${Math.min(Math.max(limit, 1), 200)}`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "x-api-key": apiKey,
        },
      });
      if (res.status === 401 || res.status === 403) return [];
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`01.exchange API ${res.status}: ${text.slice(0, 180)}`);
      }
      const json = (await res.json()) as O1TokensResponse;
      const list = Array.isArray(json) ? json : json.tokens || json.data || [];
      return list
        .map(mapO1Token)
        .filter((t): t is LaunchpadToken => t !== null)
        .slice(0, limit);
    } catch (e) {
      if (String(e).includes("401") || String(e).includes("403")) return [];
      throw e;
    }
  });
}
