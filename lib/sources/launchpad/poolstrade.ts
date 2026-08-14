/**
 * Pools.trade (Uniswap Liquidity Launchpad) adapter.
 *
 * Pools.trade exposes an undocumented, unversioned tRPC API
 * (https://pools.trade/api/trpc/curve.listLaunches) with no auth.
 * Per the implementation plan this is treated as a REFERENCE source:
 * - We probe `curve.listLaunches` best-effort;
 * - If it fails or changes shape, the adapter degrades to returning []
 *   (never throws into the feed) and coverage falls back to the
 *   GeckoTerminal `uniswap-pools-trade` slug which already flows
 *   through the existing GeckoTerminal pipeline.
 *
 * Launch modes: Instant (v4 pool from block one → "graduated") and
 * CCA Crowd Launch (~4h continuous clearing auction → "auction" until
 * migration, then "graduated").
 */

import { cached } from "../../cache";
import { parseMaybeNumber } from "../shared";
import { launchpadInfo } from "./registry";
import type { LaunchpadToken } from "./types";

const TRPC_BASE = "https://pools.trade/api/trpc";
const CACHE_TTL_MS = 20_000;

/** Minimal structural types for the tRPC JSON payload. */
interface PoolLaunch {
  token?: { address?: string; name?: string; symbol?: string };
  tokenAddress?: string;
  address?: string;
  name?: string;
  symbol?: string;
  pairAddress?: string;
  pool?: string;
  createdAt?: number | string;
  timestamp?: number | string;
  launchedAt?: number | string;
  priceUsd?: number | string;
  fdvUsd?: number | string;
  marketCap?: number | string;
  liquidityUsd?: number | string;
  volume24h?: number | string;
  holders?: number;
  phase?: string;
  graduated?: boolean;
  auction?: boolean;
  graduationPct?: number | string;
  thresholdQuote?: number | string;
  logo?: string;
  description?: string;
}

interface TrpcEnvelope {
  result?: {
    data?: {
      json?: PoolLaunch[] | { launches?: PoolLaunch[]; items?: PoolLaunch[] };
    };
  };
}

function toMs(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

function mapPoolLaunch(raw: PoolLaunch): LaunchpadToken | null {
  const tokenAddress = (
    raw.tokenAddress ||
    raw.token?.address ||
    raw.address ||
    ""
  ).toLowerCase();
  if (!tokenAddress || tokenAddress === "0x") return null;

  const launchTimeMs = toMs(raw.createdAt ?? raw.launchedAt ?? raw.timestamp);
  const platform = launchpadInfo("poolstrade");

  let phase: LaunchpadToken["phase"] = "graduated";
  if (raw.auction || raw.phase === "auction") phase = "auction";
  else if (raw.phase === "bonding" || raw.phase === "curve") phase = "bonding";

  return {
    id: `poolstrade:${tokenAddress}`,
    platform: "poolstrade",
    platformName: platform?.name ?? "Pools.trade",
    tokenAddress,
    pairAddress: (raw.pairAddress || raw.pool || "").toLowerCase() || null,
    name: raw.name || raw.token?.name || raw.symbol || "Unknown",
    symbol: raw.symbol || raw.token?.symbol || "???",
    phase,
    priceUsd: parseMaybeNumber(raw.priceUsd),
    fdvUsd: parseMaybeNumber(raw.fdvUsd ?? raw.marketCap),
    marketCapUsd: parseMaybeNumber(raw.marketCap),
    liquidityUsd: parseMaybeNumber(raw.liquidityUsd),
    volume24hUsd: parseMaybeNumber(raw.volume24h),
    launchTimeMs,
    ageMs: launchTimeMs != null ? Date.now() - launchTimeMs : null,
    launchBlock: null,
    imageUrl: raw.logo || null,
    description: raw.description || null,
    socials: [],
    graduationProgressPct: parseMaybeNumber(raw.graduationPct),
    thresholdQuote: parseMaybeNumber(raw.thresholdQuote),
    devBuyUsd: null,
    holders: typeof raw.holders === "number" ? raw.holders : null,
    feeSplit: null,
    taxRateBps: null,
    lockedLiquidity: true,
    quoteSymbol: null,
  };
}

function unwrapList(payload: unknown): PoolLaunch[] {
  if (Array.isArray(payload)) return payload as PoolLaunch[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["launches", "items", "tokens"]) {
      if (Array.isArray(obj[key])) return obj[key] as PoolLaunch[];
    }
  }
  return [];
}

/**
 * Fetch recent Pools.trade launches via the public tRPC endpoint.
 * Best-effort: any failure returns [] (GeckoTerminal slug covers it).
 */
export async function fetchPoolsTradeTokens(): Promise<LaunchpadToken[]> {
  return cached("launchpad:poolstrade", CACHE_TTL_MS, async () => {
    try {
      const res = await fetch(`${TRPC_BASE}/curve.listLaunches?batch=1&input=%7B%220%22%3A%7B%7D%7D`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const json = (await res.json()) as TrpcEnvelope | TrpcEnvelope[];
      const batch = Array.isArray(json) ? json[0] : json;
      const payload = batch?.result?.data?.json;
      return unwrapList(payload)
        .map(mapPoolLaunch)
        .filter((t): t is LaunchpadToken => t !== null);
    } catch {
      // Reference source — never break the feed.
      return [];
    }
  });
}
