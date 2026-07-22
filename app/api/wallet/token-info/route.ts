import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { ERC20_ABI } from "@/lib/contracts/abi";
import { readContractSafe } from "@/lib/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/wallet/token-info
 * body: { address: 0x… }
 *
 * Reads ERC20 metadata (symbol / name / decimals / totalSupply) on
 * Robinhood Chain with graceful degradation — each field is fetched
 * independently so one failing call doesn't void the others.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const address = body?.address;

    if (!address || typeof address !== "string" || !isAddress(address)) {
      return NextResponse.json(
        { error: "Invalid address" },
        { status: 400 }
      );
    }

    const addr = address as Address;
    const addrLower = address.toLowerCase();
    const abi = ERC20_ABI as readonly unknown[];

    const [symbol, name, decimals, totalSupply] = await Promise.allSettled([
      readContractSafe<string>({
        address: addr,
        abi,
        functionName: "symbol",
        cacheKey: `erc20:${addrLower}:symbol`,
      }),
      readContractSafe<string>({
        address: addr,
        abi,
        functionName: "name",
        cacheKey: `erc20:${addrLower}:name`,
      }),
      readContractSafe<number>({
        address: addr,
        abi,
        functionName: "decimals",
        cacheKey: `erc20:${addrLower}:decimals`,
      }),
      readContractSafe<bigint>({
        address: addr,
        abi,
        functionName: "totalSupply",
        cacheKey: `erc20:${addrLower}:totalSupply`,
      }),
    ]);

    return NextResponse.json({
      symbol: symbol.status === "fulfilled" ? symbol.value : "???",
      name: name.status === "fulfilled" ? name.value : "Unknown",
      decimals: decimals.status === "fulfilled" ? Number(decimals.value) : 18,
      totalSupply:
        totalSupply.status === "fulfilled" ? totalSupply.value.toString() : "0",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}