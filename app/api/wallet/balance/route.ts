import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits, type Address } from "viem";
import { robinhoodViemChain } from "@/lib/chains";

const client = createPublicClient({
  chain: robinhoodViemChain,
  transport: http(),
});

export async function POST(req: Request) {
  try {
    const { address } = await req.json();

    if (!address || typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    const balance = await client.getBalance({ address: address as Address });
    const ethBalance = formatUnits(balance, 18);

    return NextResponse.json({ balance: ethBalance, wei: balance.toString() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
