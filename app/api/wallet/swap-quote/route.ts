import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { robinhoodViemChain, ROBINHOOD_RPC_URL } from "@/lib/chains";
import { UNISWAP_V2_ROUTER_ABI } from "@/lib/contracts/abi";
import { ROBINHOOD_ADDRESSES, WETH_BY_CHAIN } from "@/lib/contracts/addresses";
import { CHAIN } from "@/lib/constants";

const client = createPublicClient({
  chain: robinhoodViemChain,
  transport: http(ROBINHOOD_RPC_URL),
});

export async function POST(req: Request) {
  try {
    const { tokenIn, tokenOut, amountIn } = await req.json();

    if (!tokenIn || !tokenOut || !amountIn) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const weth = WETH_BY_CHAIN[CHAIN.chainId] ?? ROBINHOOD_ADDRESSES.WETH;

    // Build path: if either token is WETH, direct path; otherwise go through WETH
    let path: Address[];
    const tokenInLower = tokenIn.toLowerCase();
    const tokenOutLower = tokenOut.toLowerCase();
    const wethLower = weth.toLowerCase();

    if (tokenInLower === wethLower || tokenOutLower === wethLower) {
      // Direct path through WETH
      path = [tokenIn as Address, tokenOut as Address];
    } else {
      // Double-hop: tokenIn -> WETH -> tokenOut
      path = [tokenIn as Address, weth as Address, tokenOut as Address];
    }

    const amounts = await client.readContract({
      abi: UNISWAP_V2_ROUTER_ABI,
      address: ROBINHOOD_ADDRESSES.UNISWAP_V2_ROUTER as Address,
      functionName: "getAmountsOut",
      args: [BigInt(amountIn), path],
    });

    const amountOut = amounts[amounts.length - 1];

    return NextResponse.json({
      amountOut: amountOut.toString(),
      path: path.map((a) => a.toLowerCase()),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
