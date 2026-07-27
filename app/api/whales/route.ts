import { NextResponse } from "next/server";
import { fetchArkhamTokenTransfers } from "@/lib/sources/arkham";
import { whaleLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/whales
 *
 * Returns recent whale transactions (>$10k) across all tracked tokens
 * on Robinhood Chain, sourced from Arkham Intelligence.
 */
export const GET = withRateLimit(whaleLimiter, async () => {
  const apiKey = process.env.ARKHAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ARKHAM_API_KEY not configured", transactions: [] },
      { status: 200 }
    );
  }

  try {
    // Fetch whale transactions from Arkham for the Robinhood chain
    const url = `https://api.arkm.com/transfers?chain=robinhood&minValueUsd=10000&limit=50&sort=time&order=desc`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "API-Key": apiKey,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Arkham API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const transfers = (data.transfers || []).map((tx: any) => ({
      hash: tx.transactionHash,
      type: classifyTx(tx),
      trader: tx.fromAddress,
      tokenSymbol: tx.tokenSymbol || tx.token?.symbol || "UNKNOWN",
      tokenAddress: tx.token?.address || "",
      usdValue: tx.valueUsd || 0,
      tokenAmount: tx.value || 0,
      timestamp: new Date(tx.timestamp).getTime(),
      entity: tx.fromEntity?.name || tx.toEntity?.name || null,
      entityLogo: tx.fromEntity?.logo || tx.toEntity?.logo || null,
      chain: "robinhood",
    }));

    return NextResponse.json(
      { transactions: transfers, count: transfers.length },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e), transactions: [] }, { status: 200 });
  }
});

function classifyTx(tx: any): string {
  const from = (tx.fromAddress || "").toLowerCase();
  const to = (tx.toAddress || "").toLowerCase();
  const zero = "0x0000000000000000000000000000000000000000";
  if (from === zero) return "mint";
  if (to === zero) return "burn";
  const cls = (tx.classification || "").toLowerCase();
  if (cls === "swap") return "buy";
  return "transfer";
}
