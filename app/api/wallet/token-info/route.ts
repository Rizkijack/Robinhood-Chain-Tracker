import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { robinhoodViemChain, ROBINHOOD_RPC_URL } from "@/lib/chains";
import { ERC20_ABI } from "@/lib/contracts/abi";

const client = createPublicClient({
  chain: robinhoodViemChain,
  transport: http(ROBINHOOD_RPC_URL),
});

export async function POST(req: Request) {
  try {
    const { address } = await req.json();

    if (!address || typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    const [symbol, name, decimals, totalSupply] = await Promise.allSettled([
      client.readContract({ abi: ERC20_ABI, address: address as Address, functionName: "symbol" }),
      client.readContract({ abi: ERC20_ABI, address: address as Address, functionName: "name" }),
      client.readContract({ abi: ERC20_ABI, address: address as Address, functionName: "decimals" }),
      client.readContract({ abi: ERC20_ABI, address: address as Address, functionName: "totalSupply" }),
    ]);

    return NextResponse.json({
      symbol: symbol.status === "fulfilled" ? symbol.value : "???",
      name: name.status === "fulfilled" ? name.value : "Unknown",
      decimals: decimals.status === "fulfilled" ? Number(decimals.value) : 18,
      totalSupply: totalSupply.status === "fulfilled" ? totalSupply.value.toString() : "0",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
