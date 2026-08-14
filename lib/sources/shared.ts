import { CACHE_TTL_MS, USER_AGENT } from "../constants";
import { cached } from "../cache";
import { num } from "../format";
import type { TrackedPair, TrackSource } from "../types";

export interface SourceFetchOptions {
  timeoutMs?: number;
  cacheKey: string;
  ttlMs?: number;
  headers?: HeadersInit;
  /** HTTP method (default GET). Set to "POST" for GraphQL etc. */
  method?: string;
  /** Request body (stringified by the caller when needed). */
  body?: string;
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
        method: options.method ?? "GET",
        body: options.body,
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
  const links: TrackedPair["links"] = {
    dexscreener: pair
      ? `https://dexscreener.com/robinhood/${pair}`
      : "https://dexscreener.com/robinhood",
    birdeye: token
      ? `https://birdeye.so/token/${token}?chain=robinhood`
      : "https://birdeye.so/",
  };
  // Launchpad tokens get a link to their platform's token page.
  if (source === "launchpad") {
    links.launchpad = `https://lemon.fun/token/${token}`;
  }
  return links;
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



/**
 * Collect social media links from multiple sources
 */
export function collectSocialLinks(
  dexSocials?: { type: string; url: string }[],
  geoSocials?: { type: string; url: string }[]
): { type: string; url: string }[] {
  const allSocials = [...(dexSocials || []), ...(geoSocials || [])];
  const uniqueLinks = new Map<string, { type: string; url: string }>();
  
  for (const social of allSocials) {
    const type = social.type.toLowerCase();
    const url = social.url.toLowerCase();
    
    // Normalize type names
    let normalizedType = type;
    if (type.includes('twitter') || type.includes('x.com') || type === 'x') {
      normalizedType = 'twitter';
    } else if (type.includes('telegram') || type.includes('t.me')) {
      normalizedType = 'telegram';
    } else if (type.includes('discord')) {
      normalizedType = 'discord';
    } else if (type.includes('web') || type.includes('site') || type.includes('homepage')) {
      normalizedType = 'website';
    }
    
    // Only keep the four main social media types
    if (!['twitter', 'telegram', 'discord', 'website'].includes(normalizedType)) {
      continue;
    }
    
    // Use the first occurrence of each URL
    if (!uniqueLinks.has(url)) {
      uniqueLinks.set(url, {
        type: normalizedType,
        url: social.url // Keep original URL with correct case
      });
    }
  }
  
  return Array.from(uniqueLinks.values());
}