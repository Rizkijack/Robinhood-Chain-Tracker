/**
 * lemon.fun launchpad adapter — public REST API, no key required.
 *
 * Docs: https://lemon.fun/docs
 * Base: https://lemon.fun/api/public/launchpad
 * Endpoints used:
 *   GET /tokens?sort=created&limit=200   → token list (newest first)
 *   GET /token/:address                  → single token (metadata, pool state)
 * API is unauthenticated, per-IP rate-limited ("generous for indexers"),
 * with ~12s server-side cache.
 */

import { cached } from "../../cache";
import { env, parseMaybeNumber } from "../shared";
import { launchpadInfo } from "./registry";
import type { LaunchpadToken } from "./types";

const BASE = "https://lemon.fun/api/public/launchpad";
const CACHE_TTL_MS = 12_000;

/** Raw shape of /tokens and /token/:address responses. */
interface LemonRawToken {
  address?: string;
  token?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  logo?: string;
  imageUrl?: string;
  description?: string;
  marketCap?: number | string;
  fdv?: number | string;
  price?: number | string;
  priceUsd?: number | string;
  liquidity?: number | string;
  volume24h?: number | string;
  totalVolume?: number | string;
  pool?: string | { address?: string };
  pair?: string | { address?: string };
  createdAt?: number | string;
  launchTime?: number | string;
  timestamp?: number | string;
  holders?: number;
  socials?: { type?: string; url?: string }[];
  websites?: { url?: string }[];
  quoteToken?: { symbol?: string } | string;
  feeSplit?: string;
  taxBps?: number;
  locked?: boolean;
  status?: string;
}

function toMs(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  // 10-digit = seconds; 13-digit = ms.
  return n < 1e12 ? n * 1000 : n;
}

function extractAddress(raw: LemonRawToken): string {
  const a = raw.address || raw.token || "";
  return a.toLowerCase();
}

function extractPair(raw: LemonRawToken): string | null {
  const p = raw.pool || raw.pair;
  if (!p) return null;
  if (typeof p === "string") return p.toLowerCase() || null;
  return (p?.address || "").toLowerCase() || null;
}

function extractQuoteSymbol(raw: LemonRawToken): string | null {
  const q = raw.quoteToken;
  if (!q) return null;
  return typeof q === "string" ? q : q.symbol || null;
}

function mapLemonToken(raw: LemonRawToken): LaunchpadToken | null {
  const tokenAddress = extractAddress(raw);
  if (!tokenAddress || tokenAddress === "0x") return null;

  const launchTimeMs = toMs(raw.createdAt ?? raw.launchTime ?? raw.timestamp);
  const name = raw.name?.trim() || raw.symbol?.trim() || "Unknown";
  const symbol = raw.symbol?.trim() || "???";

  const platform = launchpadInfo("lemon");
  const socials = Array.isArray(raw.socials)
    ? raw.socials
        .map((s) => ({
          type: s.type || "link",
          url: s.url || "",
        }))
        .filter((s) => s.url)
    : [];

  return {
    id: `lemon:${tokenAddress}`,
    platform: "lemon",
    platformName: platform?.name ?? "Lemon",
    tokenAddress,
    pairAddress: extractPair(raw),
    name,
    symbol,
    // Lemon tokens trade in a real pool from block one → always graduated.
    phase: "graduated",
    priceUsd: parseMaybeNumber(raw.priceUsd ?? raw.price),
    fdvUsd: parseMaybeNumber(raw.fdv ?? raw.marketCap),
    marketCapUsd: parseMaybeNumber(raw.marketCap),
    liquidityUsd: parseMaybeNumber(raw.liquidity),
    volume24hUsd: parseMaybeNumber(raw.volume24h ?? raw.totalVolume),
    launchTimeMs,
    ageMs: launchTimeMs != null ? Date.now() - launchTimeMs : null,
    launchBlock: null,
    imageUrl: raw.logo || raw.imageUrl || null,
    description: raw.description || null,
    socials,
    graduationProgressPct: null,
    thresholdQuote: null,
    devBuyUsd: null,
    holders: typeof raw.holders === "number" ? raw.holders : null,
    feeSplit: raw.feeSplit || null,
    taxRateBps: typeof raw.taxBps === "number" ? raw.taxBps : null,
    lockedLiquidity: raw.locked ?? true,
    quoteSymbol: extractQuoteSymbol(raw),
  };
}

interface LemonTokensResponse {
  tokens?: LemonRawToken[];
  data?: LemonRawToken[];
}

/**
 * Fetch the most recent lemon.fun launchpad tokens (newest first).
 * Wrapped in a short server-side cache to respect the 12s API cache.
 */
export async function fetchLemonTokens(limit = 200): Promise<LaunchpadToken[]> {
  return cached(`launchpad:lemon:${limit}`, CACHE_TTL_MS, async () => {
    const url = `${BASE}/tokens?sort=created&limit=${Math.min(Math.max(limit, 1), 200)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": env("USER_AGENT") || "RobinhoodPairTracker/1.0",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Lemon API ${res.status}: ${text.slice(0, 180)}`);
    }
    const json = (await res.json()) as LemonTokensResponse;
    const list = Array.isArray(json) ? json : json.tokens || json.data || [];
    return list
      .map(mapLemonToken)
      .filter((t): t is LaunchpadToken => t !== null)
      .slice(0, limit);
  });
}
