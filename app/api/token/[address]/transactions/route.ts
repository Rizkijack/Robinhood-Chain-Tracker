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
  _req: NextRequest,
  context?: { params: Record<string, string> }
) => {
  const address = context?.params?.address ?? "";
  const parsed = validateRequest(z.object({ address: addressParam }), {
    address,
  });
  if (!parsed.success) return parsed.response;

  try {
    // Try both sources and merge results
    const [geoData, dexData] = await Promise.allSettled([
      fetchTokenTransactions(parsed.data.address),
      fetchDexScreenerTransactions(parsed.data.address)
    ]);
    
    let transactions: any[] = [];
    
    // Use GeckoTerminal data if available
    if (geoData.status === 'fulfilled' && geoData.value.transactions.length > 0) {
      transactions = geoData.value.transactions;
    } 
    // Fall back to DexScreener if GeckoTerminal fails
    else if (dexData.status === 'fulfilled' && dexData.value.transactions.length > 0) {
      transactions = dexData.value.transactions;
    }
    
    // Sort by timestamp (newest first)
    transactions.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limit to 50 transactions
    const limitedTransactions = transactions.slice(0, 50);
    
    return NextResponse.json({
      transactions: limitedTransactions,
      source: geoData.status === 'fulfilled' ? 'geckoterminal' : 'dexscreener',
      count: limitedTransactions.length,
      updatedAt: new Date().toISOString()
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
});
