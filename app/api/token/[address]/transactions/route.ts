import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchArkhamTokenTransfers } from "@/lib/sources/arkham";
import { fetchBlockscoutTokenTransfers } from "@/lib/sources/blockscout";
import { addressParam } from "@/lib/validation/schemas";
import { validateRequest } from "@/lib/validation/helpers";
import { strictLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/token/[address]/transactions
 *
 * Streams recent token transfers using Arkham Intelligence as the primary
 * data source, with Blockscout as fallback.
 *
 * Query params:
 *   pairAddress (optional) — used to classify buy vs sell
 *   priceUsd    (optional) — used to compute USD value (fallback)
 *   symbol      (optional) — token symbol for display
 *   limit       (optional) — max rows to return (default 50, max 200)
 */
export const GET = withRateLimit(strictLimiter, async (
  req: NextRequest,
  context?: { params: Record<string, string> }
) => {
  const address = context?.params?.address ?? "";
  const parsed = validateRequest(z.object({ address: addressParam }), {
    address,
  });
  if (!parsed.success) return parsed.response;

  const pairAddress = req.nextUrl.searchParams.get("pairAddress") || undefined;
  const tokenPriceUsd = req.nextUrl.searchParams.get("priceUsd")
    ? parseFloat(req.nextUrl.searchParams.get("priceUsd")!)
    : undefined;
  const tokenSymbol = req.nextUrl.searchParams.get("symbol") || undefined;
  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
  const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 50, 200));

  try {
    // Try Arkham Intelligence first (primary source)
    let transactions;
    let source = "arkham";

    if (process.env.ARKHAM_API_KEY) {
      try {
        transactions = await fetchArkhamTokenTransfers(
          parsed.data.address,
          {
            pairAddress,
            tokenPriceUsd,
            limit,
          }
        );
      } catch (err) {
        console.warn("[transactions] Arkham failed, falling back to Blockscout:", err);
        source = "blockscout";
        transactions = await fetchBlockscoutTokenTransfers(
          parsed.data.address,
          {
            pairAddress,
            tokenPriceUsd,
            pages: 2, // Increase pages for more transactions
          }
        );
      }
    } else {
      // No Arkham key — use Blockscout directly
      source = "blockscout";
      transactions = await fetchBlockscoutTokenTransfers(
        parsed.data.address,
        {
          pairAddress,
          tokenPriceUsd,
          pages: 2, // Increase pages for more transactions
        }
      );
    }

    const sliced = (transactions || []).slice(0, limit);

    return NextResponse.json(
      {
        transactions: sliced,
        source,
        count: sliced.length,
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
});
