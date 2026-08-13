import { NextResponse } from "next/server";
import { fetchArkhamWhaleTransfers } from "@/lib/sources/arkham";
import { whaleLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";
import type { WhaleTransaction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/whales
 *
 * Returns recent whale transactions (>$10k) across all tracked tokens
 * on Robinhood Chain, sourced from Arkham Intelligence via
 * `fetchArkhamWhaleTransfers()`, which handles caching, normalization,
 * entity attribution, and rate-limit safety.
 */
export const GET = withRateLimit(whaleLimiter, async () => {
  const apiKey = process.env.ARKHAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ARKHAM_API_KEY not configured", transactions: [] },
      { status: 503 }
    );
  }

  try {
    const tokenTransactions = await fetchArkhamWhaleTransfers({
      limit: 50,
      minValueUsd: 10_000,
    });

    const transactions: WhaleTransaction[] = tokenTransactions.map((tx) => ({
      hash: tx.hash,
      type: tx.type,
      trader: tx.trader,
      tokenSymbol: tx.tokenSymbol,
      tokenAddress: tx.tokenAddress ?? "",
      usdValue: tx.usdValue,
      tokenAmount: tx.tokenAmount,
      timestamp: tx.timestamp,
      entity: tx.entity ?? null,
      entityLogo: tx.entityLogo ?? null,
      chain: tx.chain ?? "robinhood",
    }));

    return NextResponse.json(
      { transactions, count: transactions.length },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: String(e), transactions: [] },
      { status: 502 }
    );
  }
});
