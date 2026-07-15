import { NextRequest, NextResponse } from "next/server";
import { searchPairs } from "@/lib/aggregate";
import { searchQueryParams } from "@/lib/validation/schemas";
import { validateRequest } from "@/lib/validation/helpers";
import { strictLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withRateLimit(strictLimiter, async (req: NextRequest) => {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = validateRequest(searchQueryParams, raw);
  if (!parsed.success) return parsed.response;

  const q = parsed.data.q;
  try {
    const data = await searchPairs(q);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e), pairs: [], count: 0 },
      { status: 500 }
    );
  }
});
