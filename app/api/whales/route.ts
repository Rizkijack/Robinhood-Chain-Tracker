import { NextResponse } from "next/server";
import { whaleLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getNewPairsFeed } from "@/lib/aggregate";
import { fetchBlockscoutTokenTransfers } from "@/lib/sources/blockscout";
import type { WhaleTransaction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** How many tracked tokens to scan for whale activity. */
const MAX_TRACKED_TOKENS = 15;
/** Max transfers to keep per token (after filtering whales). */
const MAX_PER_TOKEN = 10;
/** Min USD to call a transfer a "whale" (matches WHALE_THRESHOLD_USD). */
const MIN_WHALE_USD = 10_000;
/** Strict 0x-prefixed 40-hex-char contract address. */
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** A token from the feed that we scan for whale transfers. */
interface ScanToken {
  tokenAddress: string;
  symbol: string;
  priceUsd: number | null;
  pairAddress: string;
}

/**
 * GET /api/whales
 *
 * Returns recent whale transactions (≥ $10k) across the currently tracked
 * tokens on Robinhood Chain, sourced from the Robinhood Explorer
 * (Blockscout). We scan the most recent tracked tokens from the new-pairs
 * feed and keep transfers above the whale threshold.
 *
 * Note: Blockscout does not provide entity attribution — rows show the
 * counterparty wallet address instead (see `trader`).
 */
export const GET = withRateLimit(whaleLimiter, async () => {
  try {
    // Get the most recent tracked tokens to know which contracts to scan.
    let tokens: ScanToken[] = [];
    try {
      const feed = await getNewPairsFeed();
      tokens = feed.pairs
        .filter((p) => p.tokenAddress && ADDRESS_RE.test(p.tokenAddress))
        .slice(0, MAX_TRACKED_TOKENS)
        .map((p) => ({
          tokenAddress: p.tokenAddress.toLowerCase(),
          symbol: p.symbol,
          priceUsd: p.priceUsd,
          pairAddress: p.pairAddress,
        }));
    } catch {
      // Feed failure — fall back to empty list; the endpoint returns [].
    }

    if (!tokens.length) {
      return NextResponse.json(
        { transactions: [], count: 0 },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // Scan each token with Blockscout, in small batches to be polite.
    const batchSize = 3;
    const transactions: WhaleTransaction[] = [];

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (t) => {
          const txs = await fetchBlockscoutTokenTransfers(t.tokenAddress, {
            pages: 2,
            // Price is required: Blockscout v1 returns no USD value, so
            // without it every usdValue is 0 and the whale filter below
            // would drop the entire feed.
            tokenPriceUsd: t.priceUsd,
            // Pair address enables correct buy/sell classification.
            pairAddress: t.pairAddress,
          });
          return txs
            .filter((tx) => (tx.usdValue || 0) >= MIN_WHALE_USD)
            .slice(0, MAX_PER_TOKEN)
            .map<WhaleTransaction>((tx) => ({
              hash: tx.hash,
              type: tx.type,
              trader: tx.trader,
              tokenSymbol: t.symbol || tx.tokenSymbol,
              tokenAddress: t.tokenAddress,
              usdValue: tx.usdValue,
              tokenAmount: tx.tokenAmount,
              timestamp: tx.timestamp,
              entity: null,
              entityLogo: null,
              chain: "robinhood",
            }));
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") transactions.push(...r.value);
      }
    }

    transactions.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json(
      { transactions, count: transactions.length },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e), transactions: [] }, { status: 500 });
  }
});
