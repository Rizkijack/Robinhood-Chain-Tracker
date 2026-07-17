import { COINGECKO_BASE, SOURCE_TIMING } from "../constants";
import { env, fetchJsonCached } from "./shared";
import type { TrackedPair } from "../types";

const TTL = SOURCE_TIMING.coingecko.cacheTtlMs;

/**
 * Build CoinGecko auth headers from the configured API key (env var).
 * - Demo keys (prefix "CG-")  -> header `x-cg-demo-api-key`
 * - Pro keys (anything else)  -> header `x-cg-pro-api-key`
 * When no key is set, the request falls back to the anonymous public tier
 * (lower rate limits) so enrichment stays best-effort and never breaks.
 */
function cgAuthHeaders(): HeadersInit {
  const key = env("COINGECKO_API_KEY");
  if (!key) return {};
  if (key.startsWith("CG-")) return { "x-cg-demo-api-key": key };
  return { "x-cg-pro-api-key": key };
}

interface CgMarket {
  id?: string;
  symbol?: string;
  name?: string;
  image?: string;
  current_price?: number | null;
  market_cap?: number | null;
  price_change_percentage_24h?: number | null;
  total_volume?: number | null;
}

/**
 * Best-effort enrichment: fill null price/marketCap on existing Robinhood rows
 * using CoinGecko's global market data, matched by token symbol. CoinGecko does
 * not index Robinhood Chain on-chain tokens, so it is used strictly to enrich
 * Robinhood tokens — it never adds non-Robinhood rows to the feed. Symbol
 * collisions are possible, so we only fill fields that are currently null.
 */
export async function enrichRobinhoodWithCoinGecko(
  pairs: TrackedPair[]
): Promise<TrackedPair[]> {
  const need = pairs.filter(
    (p) => p.priceUsd == null && p.symbol && p.symbol !== "—" && p.symbol !== "???"
  );
  if (!need.length) return pairs;

  const symbols = [...new Set(need.map((p) => p.symbol.toUpperCase()))].slice(0, 40);
  if (!symbols.length) return pairs;

  try {
    const markets = (await fetchJsonCached<CgMarket[]>(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&symbols=${symbols
        .join(",")
        .toLowerCase()}&per_page=250&page=1&sparkline=false`,
      {
        cacheKey: `cg:markets:sym:${symbols.join(",").toLowerCase()}`,
        ttlMs: TTL,
        headers: cgAuthHeaders(),
      }
    )) as CgMarket[];

    const bySymbol = new Map<string, CgMarket>();
    for (const m of markets) {
      const s = (m.symbol || "").toUpperCase();
      if (s && !bySymbol.has(s)) bySymbol.set(s, m);
    }

    return pairs.map((p) => {
      if (p.priceUsd != null) return p;
      const m = bySymbol.get(p.symbol.toUpperCase());
      if (!m) return p;
      return {
        ...p,
        priceUsd: p.priceUsd ?? m.current_price ?? null,
        marketCap: p.marketCap ?? m.market_cap ?? null,
        priceChange24h: p.priceChange24h ?? m.price_change_percentage_24h ?? null,
        volume24h: p.volume24h ?? m.total_volume ?? null,
        imageUrl: p.imageUrl || m.image || null,
        links: {
          ...p.links,
          coingecko:
            p.links.coingecko || (m.id ? `https://www.coingecko.com/en/coins/${m.id}` : p.links.coingecko),
        },
      };
    });
  } catch {
    // Enrichment is strictly best-effort; never break the feed.
    return pairs;
  }
}
