import { NextRequest, NextResponse } from "next/server";
import { fetchArkhamEntityTransfers } from "@/lib/sources/arkham";
import { whaleLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/whales/entity/[name]
 *
 * Returns recent whale transactions attributed to a specific entity.
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

    const entityName = context?.params?.name
      ? decodeURIComponent(context.params.name)
      : "";

    if (!entityName) {
      return NextResponse.json(
        { error: "Entity name is required", transactions: [] },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 100);

    try {
      const transactions = await fetchArkhamEntityTransfers(entityName, { limit });

      return NextResponse.json(
        { entity: entityName, transactions, count: transactions.length },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    } catch (e) {
      return NextResponse.json(
        { error: String(e), entity: entityName, transactions: [] },
        { status: 502 }
      );
    }
  }
);
