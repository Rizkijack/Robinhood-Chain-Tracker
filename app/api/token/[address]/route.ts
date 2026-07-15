import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchTokenDetail } from "@/lib/sources/geckoterminal";
import { addressParam } from "@/lib/validation/schemas";
import { validateRequest } from "@/lib/validation/helpers";
import { strictLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withRateLimit(strictLimiter, async (
  _req: NextRequest,
  context?: { params: Record<string, string> }
) => {
  const address = context?.params?.address ?? "";
  const parsed = validateRequest(z.object({ address: addressParam }), {
    address,
  });
  if (!parsed.success) return parsed.response;

  try {
    const data = await fetchTokenDetail(parsed.data.address);
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
