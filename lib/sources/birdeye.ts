import type { TrackedPair, TrackSource } from "../types";
import { SOURCE_TIMING } from "../constants";
import { buildExternalLinks, env, fetchJsonCached, parseMaybeNumber } from "./shared";

export const BE_BASE = env("BIRDEYE_BASE_URL") || "https://public-api.birdeye.so";

/** Exact fields returned by Birdeye /defi/token_trending */
interface BeTrendingRaw {
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  liquidity?: number;
  logoURI?: string;
  volume24hUSD?: number;
  rank?: number;
  /** May also include on some plans */
  price?: number;
  priceUSD?: number;
  fdv?: number;
  marketCap?: number;
  swapCount?: number;
  swapVol24h?: number;
  createdAt?: number | string;
  icon?: string;
}

/** Exact fields returned by Birdeye /defi/v2/tokens/new_listing */
interface BeNewListingRaw {
  address?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  logoURI?: string;
}

interface BeTrendingResponse {
  success?: boolean;
  data?: {
    tokens?: BeTrendingRaw[];
    updateUnixTime?: number;
    updateTime?: string;
    total?: number;
  };
}

function beListFromResponse(json: BeTrendingResponse): BeTrendingRaw[] {
  if (json.data?.tokens) return json.data.tokens;
  return [];
}

function beTimestamp(v: unknown): number | null {
  if (typeof v === "string" && Number.isNaN(Number(v))) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  const n = parseMaybeNumber(v);
  if (n == null) return null;
  // Birdeye returns unix SECONDS (10 digits) vs DexScreener milliseconds (13 digits)
  return n < 10_000_000_000 ? n * 1000 : n;
}

function mapBeTrending(raw: BeTrendingRaw): TrackedPair | null {
  const tokenAddress = String(raw.address || "").toLowerCase();
  if (!tokenAddress) return null;

  const createdAt = beTimestamp(raw.createdAt);

  const tradeSource: TrackSource = "birdeye";

  return {
    id: `be:${tokenAddress}`,
    pairAddress: "",
    tokenAddress,
    name: raw.name || raw.symbol || "Unknown",
    symbol: raw.symbol || "—",
    quoteSymbol: "WETH",
    dexId: "birdeye-trending",
    dexName: "Birdeye Trending",
    priceUsd: raw.priceUSD ?? raw.price ?? null,
    priceNative: null,
    liquidityUsd: parseMaybeNumber(raw.liquidity),
    volume5m: null,
    volume1h: null,
    volume6h: null,
    volume24h: raw.volume24hUSD ?? null,
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
    fdv: parseMaybeNumber(raw.fdv),
    marketCap: parseMaybeNumber(raw.marketCap),
    pairCreatedAt: createdAt,
    ageMs: createdAt != null ? Date.now() - createdAt : null,
    imageUrl: raw.logoURI || raw.icon || null,
    sources: [tradeSource],
    links: buildExternalLinks("", tokenAddress, tradeSource),
    boosted: false,
  };
}

function mapBeNewListing(raw: BeNewListingRaw): TrackedPair | null {
  const tokenAddress = String(raw.address || "").toLowerCase();
  if (!tokenAddress) return null;

  return {
    id: `be-new:${tokenAddress}`,
    pairAddress: "",
    tokenAddress,
    name: raw.name || raw.symbol || "Unknown",
    symbol: raw.symbol || "—",
    quoteSymbol: "WETH",
    dexId: "birdeye-new",
    dexName: "Birdeye New",
    priceUsd: null,
    priceNative: null,
    liquidityUsd: null,
    volume5m: null,
    volume1h: null,
    volume6h: null,
    volume24h: null,
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
    fdv: null,
    marketCap: null,
    pairCreatedAt: null,
    ageMs: null,
    imageUrl: raw.logoURI || null,
    sources: ["birdeye" as TrackSource],
    links: buildExternalLinks("", tokenAddress, "birdeye" as TrackSource),
    boosted: false,
  };
}

/**
 * Fetch real-time trending tokens from Birdeye.
 * Uses /defi/token_trending sorted by rank (the only confirmed sort parameter).
 * Returns tokens with address, name, symbol, liquidity, volume24hUSD, rank, logoURI.
 * Price and market cap data may be null from this endpoint.
 */
export async function fetchBirdeyeRealTimeTrending(limit = 30): Promise<TrackedPair[]> {
  const apiKey = env("BIRDEYE_API_KEY");
  if (!apiKey) return [];

  const chain = env("BIRDEYE_CHAIN") || "robinhood";

  const url = `${BE_BASE}/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=${limit}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-chain": chain,
    "X-API-KEY": apiKey,
  };

  try {
    const json = await fetchJsonCached<BeTrendingResponse>(url, {
      cacheKey: `be:realtime:trending:${chain}:${limit}`,
      ttlMs: SOURCE_TIMING.birdeye.cacheTtlMs,
      headers,
    });
    return beListFromResponse(json)
      .map(mapBeTrending)
      .filter((p): p is TrackedPair => Boolean(p));
  } catch (e) {
    if (String(e).includes("401")) return [];
    throw e;
  }
}

/**
 * Fetch new token listings from Birdeye using /defi/v2/tokens/new_listing.
 * Returns only basic token info: address, name, symbol, decimals, logoURI.
 * No market data available from this endpoint.
 * Requires BIRDEYE_API_KEY env var. Returns empty array if not configured.
 */
export async function fetchBirdeyeNewListings(limit = 20): Promise<TrackedPair[]> {
  const apiKey = env("BIRDEYE_API_KEY");
  if (!apiKey) return [];

  const chain = env("BIRDEYE_CHAIN") || "robinhood";

  const url = `${BE_BASE}/defi/v2/tokens/new_listing?offset=0&limit=${limit}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-chain": chain,
    "X-API-KEY": apiKey,
  };

  try {
    const json = await fetchJsonCached<{ success?: boolean; data?: { tokens?: BeNewListingRaw[] } }>(url, {
      cacheKey: `be:new_listing:${chain}:${limit}`,
      ttlMs: SOURCE_TIMING.birdeye.cacheTtlMs,
      headers,
    });
    const tokens = json.data?.tokens || [];
    return tokens
      .map(mapBeNewListing)
      .filter((p): p is TrackedPair => Boolean(p));
  } catch (e) {
    if (String(e).includes("401")) return [];
    throw e;
  }
}

// Legacy export kept for compatibility
export const fetchBirdeyeTrending = fetchBirdeyeRealTimeTrending;
