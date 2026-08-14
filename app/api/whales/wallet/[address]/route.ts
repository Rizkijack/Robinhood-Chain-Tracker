import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { whaleLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateRequest } from "@/lib/validation/helpers";
import { addressParam } from "@/lib/validation/schemas";
import { getNewPairsFeed } from "@/lib/aggregate";
import { fetchBlockscoutTokenTransfers } from "@/lib/sources/blockscout";
import type { WhaleTransaction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const walletSchema = z.object({ address: addressParam });

/** How many tracked tokens to scan for this wallet's activity. */
const MAX_TRACKED_TOKENS = 20;
/** Max transfers to keep for this wallet. */
const MAX_TXS = 50;

/**
 * GET /api/whales/wallet/[address]
 *
 * Returns recent token transactions for a specific wallet address, sourced
 * from the Robinhood Explorer (Blockscout). Blockscout v1 has no
 * "all transfers for this wallet" endpoint, so we scan the currently
 * tracked tokens (from the new-pairs feed) and keep transfers where the
 * wallet is the sender or recipient.
 */
export const GET = withRateLimit(
  whaleLimiter,
  async (
    req: NextRequest,
    context?: { params: Record<string, string> }
  ) => {
    const address = context?.params?.address ?? "";
    const parsed = validateRequest(walletSchema, { address });
    if (!parsed.success) return parsed.response;

    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 100);

    try {
      // Resolve tracked tokens to scan.
      let tokens: string[] = [];
      try {
        const feed = await getNewPairsFeed();
        tokens = feed.pairs
          .filter((p) => p.tokenAddress && p.tokenAddress.length === 42)
          .slice(0, MAX_TRACKED_TOKENS)
          .map((p) => p.tokenAddress);
      } catch {
        // Feed failure — nothing to scan.
      }

      if (!tokens.length) {
        return NextResponse.json(
          { address: parsed.data.address, transactions: [], count: 0 },
          { headers: { "Cache-Control": "no-store, max-age=0" } }
        );
      }

      const walletAddr = parsed.data.address.toLowerCase();
      const transactions: WhaleTransaction[] = [];

      // Scan in small batches to be polite to the explorer.
      const batchSize = 4;
      for (let i = 0; i < tokens.length; i += batchSize) {
        const batch = tokens.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (tokenAddress) => {
            const txs = await fetchBlockscoutTokenTransfers(tokenAddress, {
              pages: 2,
            });
            // Keep transfers where this wallet is the sender or recipient.
            return txs.filter((tx) => tx.trader.toLowerCase() === walletAddr);
          })
        );

        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          for (const tx of r.value) {
            transactions.push({
              hash: tx.hash,
              type: tx.type,
              trader: tx.trader,
              tokenSymbol: tx.tokenSymbol,
              tokenAddress: tx.tokenAddress ?? "",
              usdValue: tx.usdValue,
              tokenAmount: tx.tokenAmount,
              timestamp: tx.timestamp,
              entity: null,
              entityLogo: null,
              chain: "robinhood",
            });
          }
        }
      }

      // Dedup by hash, sort newest first, trim.
      const seen = new Set<string>();
      const unique = transactions
        .filter((tx) => {
          if (seen.has(tx.hash)) return false;
          seen.add(tx.hash);
          return true;
        })
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

      return NextResponse.json(
        { address: parsed.data.address, transactions: unique, count: unique.length },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    } catch (e) {
      return NextResponse.json(
        { error: String(e), address: parsed.data.address, transactions: [] },
        { status: 502 }
      );
    }
  }
);
