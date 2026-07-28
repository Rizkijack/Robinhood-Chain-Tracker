/**
 * DefiLlama data source — free, no API key required.
 *
 * Endpoints used:
 *   - coins.llama.fi/prices/current/{chain}:{address}  → token price
 *   - api.llama.fi/overview/dexs/{chain}               → DEX volume overview
 */
import { CACHE_TTL_MS } from "../constants";
import { cached } from "../cache";
import { fetchJsonCached } from "./shared";
import type { TrackedPair } from "../types";

// ── Base URLs ─────────────────────────────────────────────────────

const COINS_BASE = "https://coins.llama.fi";
const API_BASE = "https://api.llama.fi";

// ── Internal types ────────────────────────────────────────────────

interface LlamaPriceEntry {
  decimals: number;
  symbol: string;
  price: number;
  timestamp: number;
  confidence: number;
}

interface LlamaPricesResponse {
  coins: Record<string, LlamaPriceEntry>;
}

interface DexProtocolOverview {
  defillamaId: string;
  name: string;
  displayName: string;
  module: string;
  category: string;
  logo: string;
  slug: string;
  total24h: number;
  total48hto24h: number;
  total7d: number;
  change_1d: number;
  change_7d: number;
  chains: string[];
}

interface DexOverviewResponse {
  total24h: number;
  total7d: number;
  change_1d: number;
  change_7d: number;
  protocols: DexProtocolOverview[];
  chain: string;
}

// ── Price Data ────────────────────────────────────────────────────

const CHAIN_PREFIX = "robinhood";

/**
 * Fetch current prices for one or more Robinhood Chain token addresses
 * from DefiLlama's coins API. Returns a map of address → price entry.
 *
 * Format: coins.llama.fi/prices/current/robinhood:0x123,robinhood:0x456
 * No API key required — free and open.
 */
export async function fetchDefiLlamaPrices(
  addresses: string[]
): Promise<Map<string, LlamaPriceEntry>> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].filter(Boolean);
  if (!unique.length) return new Map();

  const cacheKey = `defillama:prices:${unique.join(",")}`;
  return cached(cacheKey, CACHE_TTL_MS, async () => {
    const ids = unique.map((addr) => `${CHAIN_PREFIX}:${addr}`).join(",");
    const json = await fetchJsonCached<LlamaPricesResponse>(
      `${COINS_BASE}/prices/current/${ids}`,
      { cacheKey: `defillama:prices:raw:${ids}` }
    );

    const map = new Map<string, LlamaPriceEntry>();
    for (const [key, entry] of Object.entries(json.coins || {})) {
      // key format: "robinhood:0xabc"
      const addr = key.includes(":") ? key.slice(key.indexOf(":") + 1).toLowerCase() : key;
      map.set(addr, entry);
    }
    return map;
  });
}

/**
 * Best-effort enrichment: fill null price/marketCap/symbol on existing pairs
 * using DefiLlama's price feed. DefiLlama has excellent coverage across
 * all chains, making it a great fallback when other sources lack price data.
 */
export async function enrichRobinhoodWithDefiLlama(
  pairs: TrackedPair[]
): Promise<TrackedPair[]> {
  const need = pairs.filter(
    (p) => p.priceUsd == null && p.tokenAddress && p.tokenAddress.length > 10
  );
  if (!need.length) return pairs;

  const addrs = [...new Set(need.map((p) => p.tokenAddress.toLowerCase()))].slice(0, 50);
  if (!addrs.length) return pairs;

  try {
    const priceMap = await fetchDefiLlamaPrices(addrs);
    if (!priceMap.size) return pairs;

    return pairs.map((p) => {
      const addr = p.tokenAddress.toLowerCase();
      const entry = priceMap.get(addr);
      if (!entry) return p;

      const links = p.links.defillama
        ? p.links
        : {
            ...p.links,
            defillama: `https://defillama.com/chain/Robinhood%20Chain`,
          };

      return {
        ...p,
        priceUsd: p.priceUsd ?? entry.price,
        symbol: p.symbol !== "—" && p.symbol !== "???" ? p.symbol : entry.symbol.toUpperCase(),
        links,
      };
    });
  } catch {
    // Enrichment is strictly best-effort; never break the feed.
    return pairs;
  }
}

/**
 * Fetch enriched price data for a batch of token addresses.
 * Returns a Map of address → { price, symbol } for use in frontend.
 */
export async function fetchDefiLlamaBatchPrices(
  addresses: string[]
): Promise<Map<string, { price: number; symbol: string; decimals: number }>> {
  const priceMap = await fetchDefiLlamaPrices(addresses);
  const result = new Map<string, { price: number; symbol: string; decimals: number }>();
  for (const [addr, entry] of priceMap) {
    result.set(addr, {
      price: entry.price,
      symbol: entry.symbol,
      decimals: entry.decimals,
    });
  }
  return result;
}

// ── DEX Overview ──────────────────────────────────────────────────

export interface DexVolumeData {
  /** Total 24h volume in USD across all DEXes on the chain */
  total24h: number;
  /** Total 7d volume in USD */
  total7d: number;
  /** 24h volume change percentage */
  change1d: number;
  /** 7d volume change percentage */
  change7d: number;
  /** Per-protocol breakdown */
  protocols: {
    name: string;
    displayName: string;
    logo: string;
    category: string;
    total24h: number;
    total7d: number;
    change1d: number;
    change7d: number;
  }[];
}

/**
 * Fetch DEX volume overview for Robinhood Chain from DefiLlama.
 * No API key required.
 */
export async function fetchDexOverview(): Promise<DexVolumeData | null> {
  return cached("defillama:dex:overview", 60_000, async () => {
    try {
      const json = await fetchJsonCached<DexOverviewResponse>(
        `${API_BASE}/overview/dexs/robinhood?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`,
        { cacheKey: "defillama:dex:overview:raw" }
      );

      return {
        total24h: json.total24h ?? 0,
        total7d: json.total7d ?? 0,
        change1d: json.change_1d ?? 0,
        change7d: json.change_7d ?? 0,
        protocols: (json.protocols || []).map((p) => ({
          name: p.name,
          displayName: p.displayName || p.name,
          logo: p.logo,
          category: p.category,
          total24h: p.total24h ?? 0,
          total7d: p.total7d ?? 0,
          change1d: p.change_1d ?? 0,
          change7d: p.change_7d ?? 0,
        })),
      };
    } catch {
      return null;
    }
  });
}

/**
 * Fetch the list of all DEX protocols active on Robinhood Chain.
 * Useful for the stats page to list available DEXes.
 */
export async function fetchActiveDexes(): Promise<string[]> {
  const data = await fetchDexOverview();
  if (!data) return [];
  return data.protocols.map((p) => p.displayName || p.name);
}
