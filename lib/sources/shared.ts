import { CACHE_TTL_MS, USER_AGENT } from "../constants";
import { cached } from "../cache";
import { num } from "../format";
import type { TrackedPair, TrackSource } from "../types";

export interface SourceFetchOptions {
  timeoutMs?: number;
  cacheKey: string;
  ttlMs?: number;
  headers?: HeadersInit;
}

export async function fetchJsonCached<T>(
  url: string,
  options: SourceFetchOptions
): Promise<T> {
  return cached(options.cacheKey, options.ttlMs ?? CACHE_TTL_MS, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": USER_AGENT,
          ...options.headers,
        },
        signal: controller.signal,
      } as RequestInit);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 180)}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  });
}

export async function fetchTextCached(
  url: string,
  options: SourceFetchOptions
): Promise<string> {
  return cached(options.cacheKey, options.ttlMs ?? CACHE_TTL_MS, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": USER_AGENT,
          ...options.headers,
        },
        signal: controller.signal,
      } as RequestInit);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 180)}`);
      }
      return res.text();
    } finally {
      clearTimeout(timeout);
    }
  });
}

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function parseMaybeNumber(v: unknown): number | null {
  if (typeof v === "string") {
    const cleaned = v
      .replace(/[$,%\s,]/g, "")
      .replace(/K$/i, "e3")
      .replace(/M$/i, "e6")
      .replace(/B$/i, "e9");
    return num(cleaned);
  }
  return num(v);
}

export function buildExternalLinks(
  pairAddress: string,
  tokenAddress: string,
  source?: TrackSource
): TrackedPair["links"] {
  const pair = (pairAddress || tokenAddress || "").toLowerCase();
  const token = (tokenAddress || pairAddress || "").toLowerCase();
  return {
    dexscreener: pair
      ? `https://dexscreener.com/robinhood/${pair}`
      : "https://dexscreener.com/robinhood",
    birdeye: token
      ? `https://birdeye.so/token/${token}?chain=robinhood`
      : "https://birdeye.so/",
  };
}

export function emptyTrackedPair(
  source: TrackSource,
  tokenAddress: string,
  pairAddress = ""
): TrackedPair {
  const token = tokenAddress.toLowerCase();
  const pair = pairAddress.toLowerCase();
  return {
    id: `${source}:${pair || token}`,
    pairAddress: pair,
    tokenAddress: token,
    name: "Unknown",
    symbol: "—",
    quoteSymbol: "WETH",
    dexId: "unknown",
    dexName: "—",
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
    imageUrl: null,
    sources: [source],
    links: buildExternalLinks(pair, token, source),
  };
}
