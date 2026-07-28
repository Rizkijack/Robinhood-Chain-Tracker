import { NextRequest, NextResponse } from "next/server";
import { fetchDexOverview } from "@/lib/sources/defillama";
import { apiLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withRateLimit(apiLimiter, async (_req: NextRequest) => {
  try {
    const data = await fetchDexOverview();
    if (!data) {
      return NextResponse.json(
        { error: "DefiLlama data unavailable" },
        { status: 503 }
      );
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
});
