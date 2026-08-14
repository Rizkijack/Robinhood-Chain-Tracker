import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
 * Streams recent token transfers from the Robinhood Explorer (Blockscout).
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

  const pairAddressRaw = req.nextUrl.searchParams.get("pairAddress") || undefined;
  const tokenPriceUsdRaw = req.nextUrl.searchParams.get("priceUsd") || undefined;
  const tokenSymbolRaw = req.nextUrl.searchParams.get("symbol") || undefined;

  // Validate optional query params before they reach Blockscout and
  // are incorporated into server-side cache keys.
  let pairAddress: string | undefined;
  if (pairAddressRaw !== undefined) {
    const pa = addressParam.safeParse(pairAddressRaw);
    if (!pa.success) {
      return NextResponse.json({ error: "Invalid pairAddress" }, { status: 400 });
    }
    pairAddress = pa.data;
  }

  // priceUsd must be a finite positive number; silently ignore malformed values.
  let tokenPriceUsd: number | undefined;
  if (tokenPriceUsdRaw) {
    const n = Number(tokenPriceUsdRaw);
    if (Number.isFinite(n) && n > 0) tokenPriceUsd = n;
  }

  // symbol is a display hint — clamp to a reasonable length so it can't bloat cache keys.
  let tokenSymbol: string | undefined;
  if (tokenSymbolRaw) {
    const s = tokenSymbolRaw.trim();
    tokenSymbol = s ? s.slice(0, 32) : undefined;
  }

  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
  const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 50, 200));

  try {
    const transactions = await fetchBlockscoutTokenTransfers(
      parsed.data.address,
      {
        pairAddress,
        tokenPriceUsd,
        pages: 2, // Increase pages for more transactions
      }
    );

    const sliced = (transactions || []).slice(0, limit);

    return NextResponse.json(
      {
        transactions: sliced,
        source: "blockscout",
        count: sliced.length,
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
});
