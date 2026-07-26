import { CHAIN, GECKOTERMINAL_BASE, SOURCE_TIMING } from "../constants";
import { cached } from "../cache";
import { fetchJsonCached, parseMaybeNumber, collectSocialLinks } from "./shared";
import { num } from "../format";
import type {
  OhlcvPoint,
  PoolSummary,
  TokenDetail,
  TrackSource,
  TrackedPair,
} from "../types";

const NETWORK = CHAIN.id; // "robinhood"
const TTL = SOURCE_TIMING.geckoterminal.cacheTtlMs;

// ---- GeckoTerminal JSON:API shapes -----------------------------------------

interface GeoTokenMeta {
  name?: string;
  symbol?: string;
  address?: string;
  image_url?: string | null;
  coingecko_coin_id?: string | null;
}

interface GeoPoolAttributes {
  address?: string;
  name?: string;
  pool_created_at?: string;
  base_token_price_usd?: string | number;
  quote_token_price_usd?: string | number;
  fdv_usd?: string | number | null;
  market_cap_usd?: string | number | null;
  reserve_in_usd?: string | number;
  price_change_percentage?: Record<string, string | number | null>;
  transactions?: Record<string, { buys?: number; sells?: number; buyers?: number; sellers?: number }>;
  volume_usd?: Record<string, string | number>;
}

interface GeoRelationship {
  data?: { id?: string; type?: string };
}

interface GeoPool {
  id?: string;
  type?: string;
  attributes?: GeoPoolAttributes;
  relationships?: {
    base_token?: GeoRelationship;
    quote_token?: GeoRelationship;
    dex?: GeoRelationship;
  };
}

interface GeoListResponse {
  data?: GeoPool[];
  included?: Array<{ id?: string; type?: string; attributes?: GeoTokenMeta }>;
}

// ---- helpers ----------------------------------------------------------------

function addressFromRel(rel?: GeoRelationship): string {
  const id = rel?.data?.id || "";
  if (!id.includes("_")) return id.toLowerCase();
  // e.g. "robinhood_0xabc" -> "0xabc"
  return id.slice(id.indexOf("_") + 1).toLowerCase();
}

function parsePoolName(name?: string): { base: string; quote: string } {
  const cleaned = (name || "").trim();
  const parts = cleaned.split(/\s*\/\s*/);
  const base = (parts[0] || "Unknown").trim();
  let quote = (parts[1] || "WETH").trim();
  // strip trailing fee like "1%" or "0.3%"
  quote = quote.replace(/\s*\d+(\.\d+)?%\s*$/, "").trim() || "WETH";
  return { base, quote };
}

function findIncludedToken(
  included: GeoListResponse["included"],
  tokenId?: string
): GeoTokenMeta | undefined {
  if (!included || !tokenId) return undefined;
  return included.find((i) => i.type === "token" && i.id === tokenId)?.attributes;
}

function geckoLinks(pairAddress: string, tokenAddress: string, coingeckoId?: string | null) {
  const pair = pairAddress || tokenAddress;
  return {
    dexscreener: `https://dexscreener.com/${NETWORK}/${pair}`,
    birdeye: `https://birdeye.so/token/${tokenAddress}?chain=${NETWORK}`,
    geckoterminal: pairAddress
      ? `https://www.geckoterminal.com/${NETWORK}/pools/${pairAddress}`
      : `https://www.geckoterminal.com/${NETWORK}/tokens/${tokenAddress}`,
    coingecko: coingeckoId ? `https://www.coingecko.com/en/coins/${coingeckoId}` : undefined,
  };
}

/**
 * GeckoTerminal token info response — includes socials and websites
 * that are not available in the pool listing response.
 */
interface GeoTokenInfoResponse {
  data?: {
    id?: string;
    type?: string;
    attributes?: {
      name?: string;
      symbol?: string;
      address?: string;
      image_url?: string | null;
      coingecko_coin_id?: string | null;
      websites?: { url: string; label?: string }[];
      socials?: { url: string; type?: string; handle?: string }[];
    };
  };
}

/**
 * Fetch token info (socials, websites, image, coingecko id) from
 * GeckoTerminal's token endpoint. Keyless call; cached per-token.
 */
export async function fetchTokenInfo(
  address: string
): Promise<{
  socials: { type: string; url: string }[];
  websites: { url: string; label?: string }[];
  imageUrl: string | null;
  coingeckoId: string | null;
} | null> {
  const addr = address.toLowerCase();
  return cached(`geo:tokeninfo:${addr}`, TTL, async () => {
    try {
      const json = (await fetchJsonCached<GeoTokenInfoResponse>(
        `${GECKOTERMINAL_BASE}/networks/${NETWORK}/tokens/${addr}`,
        { cacheKey: `geo:tokeninfo:raw:${addr}` }
      )) as GeoTokenInfoResponse;

      const attrs = json.data?.attributes;
      if (!attrs) return null;

      const socials = (attrs.socials || [])
        .map((s) => ({
          type: s.type || "link",
          url: s.url || (s.handle ? `https://x.com/${s.handle}` : ""),
        }))
        .filter((s) => s.url);

      const websites = attrs.websites || [];

      return {
        socials,
        websites,
        imageUrl: attrs.image_url || null,
        coingeckoId: attrs.coingecko_coin_id || null,
      };
    } catch {
      return null;
    }
  });
}

interface MapOpts {
  sources: TrackSource[];
  tokenMeta?: GeoTokenMeta;
}

function mapGeoPool(p: GeoPool, opts: MapOpts): TrackedPair | null {
  const a = p.attributes;
  if (!a) return null;

  const pairAddress = String(a.address || "").toLowerCase();
  const tokenAddress = addressFromRel(p.relationships?.base_token).toLowerCase();
  if (!tokenAddress) return null;

  const createdAt = a.pool_created_at ? Date.parse(a.pool_created_at) : NaN;
  const ageMs = Number.isFinite(createdAt) ? Date.now() - createdAt : null;

  const priceUsd = num(a.base_token_price_usd);
  const quoteUsd = num(a.quote_token_price_usd);
  const priceNative = priceUsd != null && quoteUsd && quoteUsd > 0 ? priceUsd / quoteUsd : null;

  const pct = a.price_change_percentage || {};
  const vol = a.volume_usd || {};
  const tx = a.transactions || {};

  const m5 = tx.m5;
  const h1 = tx.h1;
  const h24 = tx.h24;

  const meta = opts.tokenMeta;
  const { base, quote } = parsePoolName(a.name);

  const dexId = addressFromRel(p.relationships?.dex) || "geckoterminal";
  const dexName = dexId.replace(/-robinhood$/, "").replace(/-/g, " ");

  return {
    id: `geo:${pairAddress || tokenAddress}`,
    pairAddress,
    tokenAddress,
    name: meta?.name || base,
    symbol: (meta?.symbol || base).toUpperCase(),
    quoteSymbol: quote,
    dexId,
    dexName: dexName.trim() || "GeckoTerminal",
    priceUsd,
    priceNative,
    liquidityUsd: num(a.reserve_in_usd),
    volume5m: num(vol.m5),
    volume1h: num(vol.h1),
    volume6h: num(vol.h6),
    volume24h: num(vol.h24),
    priceChange5m: parseMaybeNumber(pct.m5),
    priceChange1h: parseMaybeNumber(pct.h1),
    priceChange6h: parseMaybeNumber(pct.h6),
    priceChange24h: parseMaybeNumber(pct.h24),
    txns5m: m5 ? (m5.buys || 0) + (m5.sells || 0) : null,
    txns1h: h1 ? (h1.buys || 0) + (h1.sells || 0) : null,
    txns24h: h24 ? (h24.buys || 0) + (h24.sells || 0) : null,
    buys5m: m5?.buys ?? null,
    sells5m: m5?.sells ?? null,
    buys1h: h1?.buys ?? null,
    sells1h: h1?.sells ?? null,
    fdv: num(a.fdv_usd),
    marketCap: num(a.market_cap_usd),
    pairCreatedAt: Number.isFinite(createdAt) ? createdAt : null,
    ageMs,
    imageUrl: meta?.image_url || null,
    sources: opts.sources,
    links: geckoLinks(pairAddress, tokenAddress, meta?.coingecko_coin_id),
    boosted: false,
  };
}

function mapGeoList(json: GeoListResponse | null, sources: TrackSource[]): TrackedPair[] {
  if (!json?.data?.length) return [];
  return json.data
    .map((p) => {
      const tokenId = p.relationships?.base_token?.data?.id;
      const meta = findIncludedToken(json.included, tokenId);
      return mapGeoPool(p, { sources, tokenMeta: meta });
    })
    .filter((p): p is TrackedPair => Boolean(p));
}

// ---- public fetchers --------------------------------------------------------

export async function fetchGeckoNewPools(limit = 30): Promise<TrackedPair[]> {
  return cached(`geo:new:${limit}`, TTL, async () => {
    const json = (await fetchJsonCached<GeoListResponse>(
      `${GECKOTERMINAL_BASE}/networks/${NETWORK}/new_pools?page=1`,
      { cacheKey: `geo:new:raw:${limit}` }
    )) as GeoListResponse;
    return mapGeoList(json, ["geckoterminal"]).slice(0, limit);
  });
}

export async function fetchGeckoTrendingPools(limit = 30): Promise<TrackedPair[]> {
  return cached(`geo:trending:${limit}`, TTL, async () => {
    const json = (await fetchJsonCached<GeoListResponse>(
      `${GECKOTERMINAL_BASE}/networks/${NETWORK}/trending_pools?page=1`,
      { cacheKey: `geo:trending:raw:${limit}` }
    )) as GeoListResponse;
    return mapGeoList(json, ["geckoterminal"]).slice(0, limit);
  });
}

export async function searchGecko(query: string): Promise<TrackedPair[]> {
  const q = query.trim();
  if (!q) return [];
  return cached(`geo:search:${q.toLowerCase()}`, TTL, async () => {
    const json = (await fetchJsonCached<GeoListResponse>(
      `${GECKOTERMINAL_BASE}/search/pools?query=${encodeURIComponent(q)}&network=${NETWORK}&page=1`,
      { cacheKey: `geo:search:raw:${q.toLowerCase()}` }
    )) as GeoListResponse;
    return mapGeoList(json, ["geckoterminal"]);
  });
}

/**
 * Batch-enrich Robinhood tokens with GeckoTerminal real-time data.
 * Fetches each token's pools, derives token metadata (name, symbol, image,
 * coingecko id) and the highest-reserve pool for price/liquidity.
 * Rate-limited: small batch size + per-token cache (TTL).
 */
export async function enrichTokensWithGecko(
  tokenAddresses: string[],
  limit = 12
): Promise<Map<string, TrackedPair>> {
  const unique = [...new Set(tokenAddresses.map((a) => a.toLowerCase()))]
    .filter(Boolean)
    .slice(0, limit);

  const map = new Map<string, TrackedPair>();
  const batchSize = 4;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((addr) =>
        cached(`geo:token:${addr}`, TTL, async () => {
          const json = (await fetchJsonCached<GeoListResponse>(
            `${GECKOTERMINAL_BASE}/networks/${NETWORK}/tokens/${addr}/pools?page=1`,
            { cacheKey: `geo:token:raw:${addr}` }
          )) as GeoListResponse;
          if (!json.data?.length) return null;
          const tokenId = `robinhood_${addr}`;
          const meta =
            findIncludedToken(json.included, tokenId) ||
            json.included?.find((i) => i.type === "token")?.attributes;
          const best = [...json.data].sort(
            (x, y) =>
              (num(y.attributes?.reserve_in_usd) || 0) -
              (num(x.attributes?.reserve_in_usd) || 0)
          )[0];

          // Also fetch token info for socials/websites
          let socials: { type: string; url: string }[] = [];
          let websites: { url: string; label?: string }[] = [];
          let infoImageUrl: string | null = null;
          let infoCoingeckoId: string | null = null;
          try {
            const info = await fetchTokenInfo(addr);
            if (info) {
              socials = info.socials;
              websites = info.websites;
              infoImageUrl = info.imageUrl;
              infoCoingeckoId = info.coingeckoId;
            }
          } catch {
            /* ignore token info failures — pools data is still usable */
          }

          const pair = mapGeoPool(best, { sources: ["geckoterminal"], tokenMeta: meta });
          if (!pair) return null;

          // Merge token info socials/websites into the pair
          return {
            ...pair,
            socials: socials.length ? socials : pair.socials,
            websites: websites.length ? websites : pair.websites,
            imageUrl: pair.imageUrl || infoImageUrl,
          };
        })
      )
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled" && r.value) map.set(batch[j], r.value);
    }
  }
  return map;
}

// ---- token detail (used by the second-layer detail modal) -----------------

interface GeoOhlcvResponse {
  data?: {
    attributes?: {
      ohlcv_list?: (number | string | null)[][];
    };
  };
}

export type OhlcvTimeframe = "minute" | "hour" | "day" | "week" | "month";

/**
 * Top pools for a single Robinhood token, sorted by liquidity (highest first).
 * Keyless GeckoTerminal call; used for the per-token DEX/pool breakdown.
 */
export async function fetchTokenPools(
  address: string,
  limit = 10
): Promise<PoolSummary[]> {
  const addr = address.toLowerCase();
  return cached(`geo:token:pools:${addr}:${limit}`, TTL, async () => {
    const json = (await fetchJsonCached<GeoListResponse>(
      `${GECKOTERMINAL_BASE}/networks/${NETWORK}/tokens/${addr}/pools?page=1`,
      { cacheKey: `geo:token:pools:raw:${addr}:${limit}` }
    )) as GeoListResponse;

    if (!json.data?.length) return [];

    return json.data
      .map((p) => mapGeoPool(p, { sources: ["geckoterminal"] }))
      .filter((p): p is TrackedPair => Boolean(p))
      .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0))
      .slice(0, limit)
      .map((p) => ({
        poolAddress: p.pairAddress,
        dexId: p.dexId,
        dexName: p.dexName,
        priceUsd: p.priceUsd,
        liquidityUsd: p.liquidityUsd,
        volume24h: p.volume24h,
        fdv: p.fdv,
        marketCap: p.marketCap,
        pairCreatedAt: p.pairCreatedAt,
        ageMs: p.ageMs,
        txns24h: p.txns24h,
      }));
  });
}

/**
 * OHLCV candles for a token (keyless GeckoTerminal). We resolve the most
 * liquid pool for the token, then read its candles. Returns null on any
 * failure so callers can fall back to the GeckoTerminal chart iframe.
 */
export async function fetchTokenOhlcv(
  address: string,
  timeframe: OhlcvTimeframe = "hour",
  limit = 300
): Promise<OhlcvPoint[] | null> {
  const addr = address.toLowerCase();
  try {
    const pools = await fetchTokenPools(addr, 1);
    const pool = pools[0]?.poolAddress;
    if (!pool) return null;

    const url =
      `${GECKOTERMINAL_BASE}/networks/${NETWORK}/pools/${pool}/ohlcv/${timeframe}` +
      `?currency=usd&aggregate=1&limit=${limit}`;

    const json = (await fetchJsonCached<GeoOhlcvResponse>(url, {
      cacheKey: `geo:ohlcv:${addr}:${timeframe}:${limit}`,
      ttlMs: TTL,
    })) as GeoOhlcvResponse;

    const list = json.data?.attributes?.ohlcv_list;
    if (!list?.length) return null;

    return list
      .map((row) => ({
        t: Number(row[0]) || 0,
        o: num(row[1]),
        h: num(row[2]),
        l: num(row[3]),
        c: num(row[4]),
        v: num(row[5]),
      }))
      .filter((p) => p.t > 0);
  } catch {
    return null;
  }
}

/**
 * Aggregated per-token detail for the detail modal. Best-effort: any source
 * failure is captured in `errors` and the feed still returns what it can.
 */
export async function fetchTokenDetail(address: string): Promise<TokenDetail> {
  const addr = address.toLowerCase();
  const errors: { source: string; message: string }[] = [];

  let token: TrackedPair | null = null;
  try {
    const enriched = await enrichTokensWithGecko([addr], 1);
    token = enriched.get(addr) || null;
  } catch (e) {
    errors.push({ source: "geckoterminal-token", message: String(e) });
  }

  let pools: PoolSummary[] = [];
  try {
    pools = await fetchTokenPools(addr, 10);
  } catch (e) {
    errors.push({ source: "geckoterminal-pools", message: String(e) });
  }

  let ohlcv: OhlcvPoint[] | null = null;
  try {
    ohlcv = await fetchTokenOhlcv(addr, "hour", 300);
  } catch (e) {
    errors.push({ source: "geckoterminal-ohlcv", message: String(e) });
  }

  // Also try to get data from DexScreener for social links
  let dexscreenerToken: TrackedPair | null = null;
  try {
    const { fetchDexTokenPairs } = await import('./dexscreener');
    const dexPairs = await fetchDexTokenPairs(addr);
    if (dexPairs.length > 0) {
      dexscreenerToken = dexPairs[0];
    }
  } catch (e) {
    errors.push({ source: "dexscreener-social", message: String(e) });
  }

  // Also try to get token info from GeckoTerminal for socials/websites
  let geoTokenInfo: { socials: { type: string; url: string }[]; websites: { url: string; label?: string }[] } | null = null;
  try {
    geoTokenInfo = await fetchTokenInfo(addr);
  } catch (e) {
    /* ignore — best effort */
  }

  // Combine socials from all sources (DexScreener + GeckoTerminal)
  const allSocials = collectSocialLinks(
    dexscreenerToken?.socials,
    geoTokenInfo?.socials
  );
  
  // Combine websites from all sources, filtering out DEX/explorer URLs
  const allWebsites = [...(geoTokenInfo?.websites || []), ...(dexscreenerToken?.websites || []), ...(token?.websites || [])]
    .filter(website => {
      const url = website.url.toLowerCase();
      return !url.includes("dexscreener") && 
             !url.includes("birdeye") && 
             !url.includes("geckoterminal") && 
             !url.includes("coingecko") &&
             !url.includes("coinmarketcap");
    })
    .slice(0, 3); // Limit to 3 websites

  return {
    updatedAt: new Date().toISOString(),
    chain: {
      id: CHAIN.id,
      name: CHAIN.name,
      chainId: CHAIN.chainId,
      nativeGas: CHAIN.nativeGas,
    },
    address: addr,
    token,
    pools,
    ohlcv,
    socials: allSocials,
    websites: allWebsites,
    sources: [
      "GeckoTerminal token info",
      "GeckoTerminal pools", 
      "GeckoTerminal OHLCV",
      ...(dexscreenerToken ? ["DexScreener social"] : [])
    ],
    errors: errors.length ? errors : undefined,
    recommendedRefreshMs: SOURCE_TIMING.geckoterminal.refreshMs,
  };
}

/**
 * Normalize a raw GeckoTerminal transaction into a flat object.
 */
function normalizeGeoTransaction(tx: any): any | null {
  try {
    const hash = tx.hash || tx.tx_hash || tx.transaction_hash || "";
    if (!hash) return null;

    const type = (tx.type || tx.transaction_type || "buy").toLowerCase() === "sell" ? "sell" : "buy";
    const trader = tx.trader || tx.from || tx.sender || tx.wallet_address || "";
    const tokenAmount = parseFloat(tx.amount || tx.token_amount || tx.quantity || "0");
    const usdValue = parseFloat(tx.value_usd || tx.usd_value || tx.price_usd || tx.valueUSD || "0");
    const timestamp = tx.timestamp
      ? typeof tx.timestamp === "string"
        ? new Date(tx.timestamp).getTime()
        : tx.timestamp * 1000
      : Date.now();
    const dexName = tx.dex || tx.dexName || tx.dex_name || "Unknown DEX";
    const gasUsed = tx.gas_used || tx.gasUsed;
    const gasFee = tx.gas_fee || tx.gasFee;
    const blockNumber = tx.block_number || tx.blockNumber;

    return {
      hash,
      type,
      trader,
      tokenAmount,
      tokenSymbol: "",
      usdValue,
      timestamp,
      gasUsed,
      gasFee,
      dexName,
      blockNumber,
      isWhale: usdValue >= 10000,
      isMegaWhale: usdValue >= 50000,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch recent transactions for a token from GeckoTerminal.
 * Uses the pool-level endpoint `/pools/{pool_address}/transactions`.
 * If poolAddress is provided, fetches directly; otherwise resolves the
 * most-liquid pool first.
 */
export async function fetchTokenTransactions(
  address: string,
  poolAddress?: string,
  page = 1
): Promise<{ transactions: any[] }> {
  const addr = address.toLowerCase();

  return cached(`geo:transactions:${addr}:${poolAddress || "auto"}:${page}`, 5000, async () => {
    try {
      // Resolve pool address if not provided
      let pool = poolAddress?.toLowerCase();
      if (!pool) {
        const pools = await fetchTokenPools(addr, 1);
        pool = pools[0]?.poolAddress?.toLowerCase();
      }
      if (!pool) {
        return { transactions: [] };
      }

      const url = `${GECKOTERMINAL_BASE}/networks/${NETWORK}/pools/${pool}/transactions?page=${page}`;

      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`GeckoTerminal API error: ${response.status}`);
      }

      const data = await response.json();
      // GeckoTerminal v2 returns transactions in data.attributes.transactions
      // or as a top-level array — handle both shapes
      const rawTransactions: any[] =
        data.data?.attributes?.transactions ||
        data.data?.transactions ||
        data.transactions ||
        [];

      const normalized = rawTransactions
        .map((tx: any) => normalizeGeoTransaction(tx))
        .filter(Boolean);

      return { transactions: normalized };
    } catch (error) {
      console.error("Failed to fetch GeckoTerminal transactions:", error);
      return { transactions: [] };
    }
  });
}



/**
 * Fetch transactions from DexScreener via their pair endpoint.
 * DexScreener's public API doesn't expose individual swap transactions
 * directly, but the pair endpoint returns recent txns metadata.
 * We attempt the pair endpoint first; if a poolAddress is available we
 * query that, otherwise we resolve pairs for the token.
 */
export async function fetchDexScreenerTransactions(
  address: string,
  pairAddress?: string
): Promise<{ transactions: any[] }> {
  const addr = address.toLowerCase();

  return cached(`dex:transactions:${addr}:${pairAddress || "auto"}`, 3000, async () => {
    try {
      let pairs: any[] = [];

      if (pairAddress) {
        // Direct pair lookup
        const url = `https://api.dexscreener.com/latest/dex/pairs/robinhood/${pairAddress.toLowerCase()}`;
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          const data = await response.json();
          pairs = data.pairs || [];
        }
      } else {
        // Token lookup — gets all pairs for the token
        const url = `https://api.dexscreener.com/latest/dex/tokens/${addr}`;
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          const data = await response.json();
          pairs = data.pairs || [];
        }
      }

      if (!pairs.length) return { transactions: [] };

      // DexScreener pair data includes txns counts (m5/h1/h24) and
      // txns array with individual swaps when available.
      const transactions: any[] = [];

      for (const pair of pairs) {
        const txns = pair.txns;
        if (!txns) continue;

        // DexScreener may include a `swaps` array on the pair object
        if (Array.isArray(pair.swaps)) {
          for (const swap of pair.swaps) {
            const hash = swap.hash || "";
            if (!hash) continue;
            transactions.push({
              hash,
              type: (swap.type || "buy").toLowerCase() === "sell" ? "sell" : "buy",
              trader: swap.from || swap.to || "",
              tokenAmount: parseFloat(swap.amount || "0"),
              tokenSymbol: pair.baseToken?.symbol || "",
              usdValue: parseFloat(swap.valueUSD || swap.usd || "0"),
              timestamp: swap.timestamp ? new Date(swap.timestamp).getTime() : Date.now(),
              dexName: pair.dexId || "Unknown",
              isWhale: parseFloat(swap.valueUSD || swap.usd || "0") >= 10000,
              isMegaWhale: parseFloat(swap.valueUSD || swap.usd || "0") >= 50000,
            });
          }
        }
      }

      // Deduplicate by hash
      const seen = new Set<string>();
      const unique = transactions.filter((tx) => {
        if (seen.has(tx.hash)) return false;
        seen.add(tx.hash);
        return true;
      });

      return { transactions: unique };
    } catch (error) {
      console.error("Failed to fetch DexScreener transactions:", error);
      return { transactions: [] };
    }
  });
}