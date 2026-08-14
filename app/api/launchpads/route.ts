import { NextRequest, NextResponse } from "next/server";
import { getLaunchpadFeed } from "@/lib/aggregate";
import { launchpadQueryParams } from "@/lib/validation/schemas";
import { validateRequest } from "@/lib/validation/helpers";
import { apiLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/launchpads
 *
 * Aggregated launchpad feed across all Phase-1 platforms (lemon.fun,
 * Bankr, Pools.trade, Sushi Launchpad, 01.exchange).
 *
 * Query params (all optional):
 *   phase — filter by "bonding" | "auction" | "graduated" | "all" (default all)
 *   limit — max tokens to return (1–100, default 100)
 */
export const GET = withRateLimit(apiLimiter, async (req: NextRequest) => {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = validateRequest(launchpadQueryParams, raw);
  if (!parsed.success) return parsed.response;

  try {
    const data = await getLaunchpadFeed();

    let tokens = data.tokens;
    const phase = parsed.data?.phase;
    if (phase && phase !== "all") {
      tokens = tokens.filter((t) => t.phase === phase);
    }
    const limit = parsed.data?.limit ?? 100;
    tokens = tokens.slice(0, limit);

    return NextResponse.json(
      { ...data, count: tokens.length, tokens },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: String(e), tokens: [], count: 0 },
      { status: 500 }
    );
  }
});
