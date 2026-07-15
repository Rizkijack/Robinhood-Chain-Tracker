import { NextRequest, NextResponse } from "next/server";
import { getBoostsFeed } from "@/lib/aggregate";
import { emptyParams } from "@/lib/validation/schemas";
import { validateRequest } from "@/lib/validation/helpers";
import { apiLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withRateLimit(apiLimiter, async (req: NextRequest) => {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = validateRequest(emptyParams, raw);
  if (!parsed.success) return parsed.response;

  try {
    const data = await getBoostsFeed();
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
