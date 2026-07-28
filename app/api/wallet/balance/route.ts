import { NextRequest, NextResponse } from "next/server";
import { formatUnits, isAddress, type Address } from "viem";
import { getNativeBalance } from "@/lib/rpc";
import { strictLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/wallet/balance
 * body: { address: 0x… }
 *
 * Returns the native gas balance (ETH on Robinhood Chain) for a wallet
 * address. Goes through lib/rpc so we automatically fall back across
 * multiple RPC endpoints and cache the result for ~2.5s.
 */
export const POST = withRateLimit(strictLimiter, async (req: NextRequest) => {
  try {
    const body = await req.json().catch(() => null);
    const address = body?.address;

    if (!address || typeof address !== "string" || !isAddress(address)) {
      return NextResponse.json(
        { error: "Invalid address" },
        { status: 400 }
      );
    }

    const balance = await getNativeBalance(address as Address);
    return NextResponse.json({
      balance: formatUnits(balance, 18),
      wei: balance.toString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});