import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchBlockscoutTransactions,
  fetchTokenTransactions,
  fetchDexScreenerTransactions,
} from "@/lib/sources/geckoterminal";
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

  const pairAddress = req.nextUrl.searchParams.get("pairAddress") || undefined;
  const tokenPriceUsd = req.nextUrl.searchParams.get("priceUsd")
    ? parseFloat(req.nextUrl.searchParams.get("priceUsd")!)
    : undefined;
  const tokenSymbol = req.nextUrl.searchParams.get("symbol") || undefined;

  try {
    // Primary source: Blockscout explorer (has real individual tx data)
    const blockscoutData = await fetchBlockscoutTransactions(
      parsed.data.address,
      pairAddress,
      tokenPriceUsd,
      tokenSymbol
    );

    let transactions = blockscoutData.transactions;
    const sources: string[] = [];
    if (transactions.length > 0) sources.push("blockscout");

    // If Blockscout returned nothing, try GeckoTerminal + DexScreener as fallback
    if (transactions.length === 0) {
      const [geoData, dexData] = await Promise.allSettled([
        fetchTokenTransactions(parsed.data.address, pairAddress),
        fetchDexScreenerTransactions(parsed.data.address, pairAddress),
      ]);

      const geoTxns = geoData.status === "fulfilled" ? geoData.value.transactions : [];
      const dexTxns = dexData.status === "fulfilled" ? dexData.value.transactions : [];

      const seen = new Set<string>();
      for (const tx of [...geoTxns, ...dexTxns]) {
        if (tx.hash && !seen.has(tx.hash)) {
          seen.add(tx.hash);
          transactions.push(tx);
        }
      }
      if (geoTxns.length > 0) sources.push("geckoterminal");
      if (dexTxns.length > 0) sources.push("dexscreener");
    }

    // Deduplicate final list by hash
    const seen = new Set<string>();
    const unique = transactions.filter((tx: any) => {
      if (!tx.hash || seen.has(tx.hash)) return false;
      seen.add(tx.hash);
      return true;
    });

    // Sort by timestamp (newest first)
    unique.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

    const limitedTransactions = unique.slice(0, 50);

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
