import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { UNISWAP_V2_ROUTER_ABI } from "@/lib/contracts/abi";
import { ROBINHOOD_ADDRESSES, WETH_BY_CHAIN } from "@/lib/contracts/addresses";
import { CHAIN } from "@/lib/constants";
import { readContractSafe } from "@/lib/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/wallet/swap-quote
 * body: { tokenIn, tokenOut, amountIn, decimalsIn, decimalsOut }
 *
 * Returns the expected output amount for a Uniswap V2 swap on Robinhood
 * Chain. Routes through lib/rpc for fallback + caching.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const { tokenIn, tokenOut, amountIn } = body ?? {};

    if (
      !tokenIn ||
      !tokenOut ||
      !amountIn ||
      typeof tokenIn !== "string" ||
      typeof tokenOut !== "string" ||
      typeof amountIn !== "string" ||
      !isAddress(tokenIn) ||
      !isAddress(tokenOut)
    ) {
      return NextResponse.json(
        { error: "Missing or invalid params" },
        { status: 400 }
      );
    }

    let amountInBig: bigint;
    try {
      amountInBig = BigInt(amountIn);
    } catch {
      return NextResponse.json({ error: "Invalid amountIn" }, { status: 400 });
    }

    const weth = WETH_BY_CHAIN[CHAIN.chainId] ?? ROBINHOOD_ADDRESSES.WETH;

    const tokenInLower = tokenIn.toLowerCase();
    const tokenOutLower = tokenOut.toLowerCase();
    const wethLower = weth.toLowerCase();

    // If either token is WETH, direct path; otherwise hop through WETH.
    const path: Address[] =
      tokenInLower === wethLower || tokenOutLower === wethLower
        ? [tokenIn as Address, tokenOut as Address]
        : [tokenIn as Address, weth as Address, tokenOut as Address];

    const amounts = (await readContractSafe<readonly bigint[]>({
      address: ROBINHOOD_ADDRESSES.UNISWAP_V2_ROUTER as Address,
      abi: UNISWAP_V2_ROUTER_ABI as readonly unknown[],
      functionName: "getAmountsOut",
      args: [amountInBig, path],
      cacheKey: `quote:${ROBINHOOD_ADDRESSES.UNISWAP_V2_ROUTER.toLowerCase()}:${amountIn}:${path
        .map((a) => a.toLowerCase())
        .join(",")}`,
    })) as readonly bigint[];

    const amountOut = amounts[amounts.length - 1];

    // If output is 0, the token pair has no liquidity on Uniswap V2.
    // Return a clear message instead of a silent 0.
    if (amountOut === 0n) {
      return NextResponse.json(
        { error: "No liquidity for this pair on Uniswap V2" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      amountOut: amountOut.toString(),
      path: path.map((a) => a.toLowerCase()),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}