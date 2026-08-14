/**
 * Bankr launchpad adapter — public REST API, no key required.
 *
 * Docs: https://docs.bankr.bot
 * Base: https://api.bankr.bot
 * Endpoints used:
 *   GET /token-launches                 → 50 most recent launches (unauth)
 *   GET /token-launches/:addr/fees?days=30 → optional fee stats
 * Bankr deploys tokens straight into a Uniswap V4 pool at launch
 * (no bonding curve) → phase is always "graduated" with a pair.
 */

import { cached } from "../../cache";
import { parseMaybeNumber } from "../shared";
import { launchpadInfo } from "./registry";
import type { LaunchpadToken } from "./types";

const BASE = "https://api.bankr.bot";
const CACHE_TTL_MS = 20_000;

/** Raw shape of /token-launches items. */
interface BankrRawLaunch {
  tokenAddress?: string;
  token?: string;
  address?: string;
  name?: string;
  symbol?: string;
  logo?: string;
  imageUrl?: string;
  description?: string;
  chain?: string;
  createdAt?: number | string;
  timestamp?: number | string;
  launchTime?: number | string;
  poolAddress?: string;
  pairAddress?: string;
  pool?: string;
  priceUsd?: number | string;
  marketCap?: number | string;
  fdv?: number | string;
  liquidityUsd?: number | string;
  volume24h?: number | string;
  holders?: number;
  launchFee?: number | string;
  feeSplit?: string;
  quoteSymbol?: string;
  socials?: { type?: string; url?: string }[];
  website?: string;
}

function toMs(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

function mapBankrLaunch(raw: BankrRawLaunch): LaunchpadToken | null {
  const tokenAddress = (raw.tokenAddress || raw.token || raw.address || "").toLowerCase();
  if (!tokenAddress || tokenAddress === "0x") return null;

  const launchTimeMs = toMs(raw.createdAt ?? raw.timestamp ?? raw.launchTime);
  const pairAddress = (raw.poolAddress || raw.pairAddress || raw.pool || "").toLowerCase() || null;
  const platform = launchpadInfo("bankr");

  return {
    id: `bankr:${tokenAddress}`,
    platform: "bankr",
    platformName: platform?.name ?? "Bankr",
    tokenAddress,
    pairAddress,
    name: raw.name?.trim() || raw.symbol?.trim() || "Unknown",
    symbol: raw.symbol?.trim() || "???",
    phase: "graduated",
    priceUsd: parseMaybeNumber(raw.priceUsd),
    fdvUsd: parseMaybeNumber(raw.fdv ?? raw.marketCap),
    marketCapUsd: parseMaybeNumber(raw.marketCap),
    liquidityUsd: parseMaybeNumber(raw.liquidityUsd),
    volume24hUsd: parseMaybeNumber(raw.volume24h),
    launchTimeMs,
    ageMs: launchTimeMs != null ? Date.now() - launchTimeMs : null,
    imageUrl: raw.logo || raw.imageUrl || null,
    description: raw.description || null,
    socials: (raw.socials || [])
      .map((s) => ({ type: s.type || "link", url: s.url || "" }))
      .filter((s) => s.url),
    graduationProgressPct: null,
    thresholdQuote: null,
    devBuyUsd: parseMaybeNumber(raw.launchFee),
    holders: typeof raw.holders === "number" ? raw.holders : null,
    feeSplit: raw.feeSplit || null,
    taxRateBps: null,
    lockedLiquidity: true,
    quoteSymbol: raw.quoteSymbol || null,
  };
}

interface BankrLaunchesResponse {
  launches?: BankrRawLaunch[];
  data?: BankrRawLaunch[];
}

/**
 * Fetch the most recent Bankr token launches (capped by the API at ~50).
 */
export async function fetchBankrTokens(): Promise<LaunchpadToken[]> {
  return cached("launchpad:bankr", CACHE_TTL_MS, async () => {
    const res = await fetch(`${BASE}/token-launches`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Bankr API ${res.status}: ${text.slice(0, 180)}`);
    }
    const json = (await res.json()) as BankrLaunchesResponse;
    const list = Array.isArray(json) ? json : json.launches || json.data || [];
    return list
      .map(mapBankrLaunch)
      .filter((t): t is LaunchpadToken => t !== null);
  });
}
