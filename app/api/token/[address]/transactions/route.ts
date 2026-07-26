import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchTokenTransactions, fetchDexScreenerTransactions } from "@/lib/sources/geckoterminal";
import { addressParam } from "@/lib/validation/schemas";
import { validateRequest } from "@/lib/validation/helpers";
import { strictLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withRateLimit(strictLimiter, async (
  req: NextRequest,
  context?: { params: Record<string, string> }
) => {
  const address = context?.params?.address ?? "";
  const parsed = validateRequest(z.object({ address: addressParam }), {
    address,
  });
  if (!parsed.success) return parsed.response;

  // Optional pairAddress query param — used to fetch pool-level transactions
  const pairAddress = req.nextUrl.searchParams.get("pairAddress") || undefined;

  try {
    const [geoData, dexData] = await Promise.allSettled([
      fetchTokenTransactions(parsed.data.address, pairAddress),
      fetchDexScreenerTransactions(parsed.data.address, pairAddress),
    ]);

    // Merge transactions from both sources
    const geoTxns = geoData.status === "fulfilled" ? geoData.value.transactions : [];
    const dexTxns = dexData.status === "fulfilled" ? dexData.value.transactions : [];

    // Combine both sources, deduplicate by hash
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const tx of [...geoTxns, ...dexTxns]) {
      if (tx.hash && !seen.has(tx.hash)) {
        seen.add(tx.hash);
        merged.push(tx);
      }
    }

    // Sort by timestamp (newest first)
    merged.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

    // Limit to 50 transactions
    const limitedTransactions = merged.slice(0, 50);

    // Determine which sources contributed
    const sources: string[] = [];
    if (geoTxns.length > 0) sources.push("geckoterminal");
    if (dexTxns.length > 0) sources.push("dexscreener");

    return NextResponse.json(
      {
        transactions: limitedTransactions,
        source: sources.join("+") || "none",
        count: limitedTransactions.length,
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
});
