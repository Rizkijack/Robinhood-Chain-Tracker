import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchArkhamWalletTransfers } from "@/lib/sources/arkham";
import { whaleLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateRequest } from "@/lib/validation/helpers";
import { addressParam } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const walletSchema = z.object({ address: addressParam });

/**
 * GET /api/whales/wallet/[address]
 *
 * Returns recent transactions for a specific wallet address.
 */
export const GET = withRateLimit(
  whaleLimiter,
  async (
    req: NextRequest,
    context?: { params: Record<string, string> }
  ) => {
    const apiKey = process.env.ARKHAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ARKHAM_API_KEY not configured", transactions: [] },
        { status: 503 }
      );
    }

    const address = context?.params?.address ?? "";
    const parsed = validateRequest(walletSchema, { address });
    if (!parsed.success) return parsed.response;

    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 100);

    try {
      const transactions = await fetchArkhamWalletTransfers(parsed.data.address, { limit });

      return NextResponse.json(
        { address: parsed.data.address, transactions, count: transactions.length },
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
