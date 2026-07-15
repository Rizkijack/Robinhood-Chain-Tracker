import { COINMARKETCAP_BASE, SOURCE_TIMING } from "../constants";
import { env, fetchJsonCached } from "./shared";
import { num } from "../format";
import type { TrackedPair } from "../types";

const TTL = SOURCE_TIMING.coinmarketcap.cacheTtlMs;

interface CmcQuoteUsd {
  price?: number;
  volume_24h?: number;
  percent_change_1h?: number;
  percent_change_24h?: number;
  market_cap?: number;
}

interface CmcCoin {
  id?: number;
  symbol?: string;
  slug?: string;
  quote?: { USD?: CmcQuoteUsd };
}

interface CmcListingsResponse {
  data?: CmcCoin[];
  status?: { error_code?: number; error_message?: string };
}

/**
 * Best-effort enrichment using CoinMarketCap: fill null price/market cap on
 * existing Robinhood rows by symbol. CoinMarketCap is a global aggregator and
 * does not index Robinhood Chain on-chain tokens, so it is used strictly to
 * enrich Robinhood tokens — it never adds non-Robinhood rows to the feed.
 * Requires COINMARKETCAP_API_KEY; returns pairs unchanged when unset.
 */
export async function enrichRobinhoodWithCoinMarketCap(
  pairs: TrackedPair[]
): Promise<TrackedPair[]> {
  const apiKey = env("COINMARKETCAP_API_KEY");
  if (!apiKey) return pairs;

  const need = pairs.filter(
    (p) => p.priceUsd == null && p.symbol && p.symbol !== "—" && p.symbol !== "???"
  );
  if (!need.length) return pairs;

  const symbols = [...new Set(need.map((p) => p.symbol.toUpperCase()))].slice(0, 40);
  if (!symbols.length) return pairs;

  try {
    const url = `${COINMARKETCAP_BASE}/cryptocurrency/quotes/latest?symbol=${symbols.join(
      ","
    )}&convert=USD`;
    const json = (await fetchJsonCached<CmcListingsResponse>(url, {
      cacheKey: `cmc:quotes:${symbols.join(",")}`,
      ttlMs: TTL,
      headers: { Accept: "application/json", "X-CMC_PRO_API_KEY": apiKey },
    })) as CmcListingsResponse;

    if (json.status?.error_code && json.status.error_code !== 0) return pairs;

    const bySymbol = new Map<string, CmcCoin>();
    for (const c of json.data || []) {
      const s = (c.symbol || "").toUpperCase();
      if (s && !bySymbol.has(s)) bySymbol.set(s, c);
    }

    return pairs.map((p) => {
      if (p.priceUsd != null) return p;
      const c = bySymbol.get(p.symbol.toUpperCase());
      if (!c) return p;
      const q = c.quote?.USD;
      const slug = c.slug || String(c.id ?? "");
      return {
        ...p,
        priceUsd: p.priceUsd ?? num(q?.price) ?? null,
        marketCap: p.marketCap ?? num(q?.market_cap) ?? null,
        priceChange24h: p.priceChange24h ?? num(q?.percent_change_24h) ?? null,
        priceChange1h: p.priceChange1h ?? num(q?.percent_change_1h) ?? null,
        volume24h: p.volume24h ?? num(q?.volume_24h) ?? null,
        imageUrl:
          p.imageUrl ||
          (c.id ? `https://s2.coinmarketcap.com/static/img/coins/64x64/${c.id}.png` : p.imageUrl),
        links: {
          ...p.links,
          coinmarketcap:
            p.links.coinmarketcap ||
            (slug ? `https://coinmarketcap.com/currencies/${slug}/` : p.links.coinmarketcap),
        },
      };
    });
  } catch {
    // Enrichment is strictly best-effort; never break the feed.
    return pairs;
  }
}
