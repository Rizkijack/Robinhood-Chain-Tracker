import type { TrackedPair, TrackSource } from "./types";

/**
 * Merge two TrackedPair records into one, preferring the most
 * complete data.  Sources are union'd.  When both sides disagree on
 * a scalar field we prefer whichever has a non-null value (the
 * “pickNum” helper).
 *
 * Exported so the feed layer can call it from enrichment paths
 * (trending feed enriches pairs individually).
 */
export function mergePair(a: TrackedPair, b: TrackedPair): TrackedPair {
  const sources = Array.from(
    new Set([...a.sources, ...b.sources])
  ) as TrackSource[];

  const pickNum = (x: number | null, y: number | null) =>
    x != null ? x : y;

  return {
    ...a,
    ...b,
    name: a.name !== "Unknown" && a.name !== "—" ? a.name : b.name,
    symbol: a.symbol !== "—" && a.symbol !== "???" ? a.symbol : b.symbol,
    pairAddress: a.pairAddress || b.pairAddress,
    tokenAddress: a.tokenAddress || b.tokenAddress,
    dexId: a.dexId !== "unknown" ? a.dexId : b.dexId,
    dexName: a.dexName !== "—" ? a.dexName : b.dexName,
    priceUsd: pickNum(b.priceUsd, a.priceUsd),
    priceNative: pickNum(b.priceNative, a.priceNative),
    liquidityUsd: pickNum(b.liquidityUsd, a.liquidityUsd),
    volume5m: pickNum(b.volume5m, a.volume5m),
    volume1h: pickNum(b.volume1h, a.volume1h),
    volume6h: pickNum(b.volume6h, a.volume6h),
    volume24h: pickNum(b.volume24h, a.volume24h),
    priceChange5m: pickNum(b.priceChange5m, a.priceChange5m),
    priceChange1h: pickNum(b.priceChange1h, a.priceChange1h),
    priceChange6h: pickNum(b.priceChange6h, a.priceChange6h),
    priceChange24h: pickNum(b.priceChange24h, a.priceChange24h),
    txns5m: pickNum(b.txns5m, a.txns5m),
    txns1h: pickNum(b.txns1h, a.txns1h),
    txns24h: pickNum(b.txns24h, a.txns24h),
    buys5m: pickNum(b.buys5m, a.buys5m),
    sells5m: pickNum(b.sells5m, a.sells5m),
    buys1h: pickNum(b.buys1h, a.buys1h),
    sells1h: pickNum(b.sells1h, a.sells1h),
    fdv: pickNum(b.fdv, a.fdv),
    marketCap: pickNum(b.marketCap, a.marketCap),
    pairCreatedAt: pickNum(a.pairCreatedAt, b.pairCreatedAt),
    ageMs:
      a.pairCreatedAt != null
        ? Date.now() - a.pairCreatedAt
        : b.pairCreatedAt != null
          ? Date.now() - b.pairCreatedAt
          : pickNum(a.ageMs, b.ageMs),
    imageUrl: a.imageUrl || b.imageUrl,
    sources,
    links: {
      dexscreener: a.links.dexscreener || b.links.dexscreener,
      birdeye: a.links.birdeye || b.links.birdeye,
      geckoterminal: a.links.geckoterminal || b.links.geckoterminal,
      coingecko: a.links.coingecko || b.links.coingecko,
      coinmarketcap: a.links.coinmarketcap || b.links.coinmarketcap,
    },
    description: a.description || b.description,
    socials: a.socials?.length ? a.socials : b.socials,
    websites: a.websites?.length ? a.websites : b.websites,
    boosted: a.boosted || b.boosted,
    boostAmount: a.boostAmount ?? b.boostAmount,
  };
}

/**
 * Dedup key for a pair — uses pairAddress when available, falls
 * back to tokenAddress.  Prefixed to avoid collisions between
 * different pairs that trade the same token.
 */
export function keyOf(p: TrackedPair): string {
  if (p.pairAddress) return `p:${p.pairAddress.toLowerCase()}`;
  return `t:${p.tokenAddress.toLowerCase()}`;
}

/**
 * Merge multiple pair lists into one deduplicated list.
 * First-list items take precedence; duplicates are merged via mergePair.
 */
export function mergeLists(...lists: TrackedPair[][]): TrackedPair[] {
  const map = new Map<string, TrackedPair>();
  for (const list of lists) {
    for (const pair of list) {
      const k = keyOf(pair);
      const prev = map.get(k);
      map.set(k, prev ? mergePair(prev, pair) : pair);
    }
  }
  return [...map.values()];
}
