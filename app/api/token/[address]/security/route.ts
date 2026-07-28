import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addressParam } from "@/lib/validation/schemas";
import { validateRequest } from "@/lib/validation/helpers";
import { strictLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";
import { SECURITY_REQUEST_TIMEOUT_MS, OWNER_BALANCE_THRESHOLD } from "@/lib/constants";
import type { TokenSecurity } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GOPLUS_URL = "https://api.gopluslabs.io/api/v1/token_security";

type GoPlusResult = Record<string, string> | undefined;

function parseNum(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseBool(v: string | undefined): boolean {
  return v === "1";
}

function computeRiskScore(raw: GoPlusResult): number {
  if (!raw) return 99;

  let score = 0;

  // Critical flags (+30 each)
  if (parseBool(raw.is_honeypot)) score += 30;
  if (parseBool(raw.cannot_buy)) score += 30;
  if (parseBool(raw.cannot_sell_all)) score += 30;
  if (parseBool(raw.is_airdrop_scam)) score += 30;

  // High flags (+20 each)
  if (parseBool(raw.hidden_owner)) score += 20;
  if (parseBool(raw.is_blacklisted)) score += 20;
  if (parseBool(raw.transfer_pausable)) score += 20;
  if (parseBool(raw.selfdestruct)) score += 20;
  if (parseBool(raw.can_take_back_ownership)) score += 20;

  // Medium flags (+15 each)
  if (parseBool(raw.is_proxy)) score += 15;
  if (parseBool(raw.is_mintable)) score += 15;
  if (parseBool(raw.owner_change_balance)) score += 15;
  if (parseBool(raw.trading_cooldown)) score += 15;
  if (parseBool(raw.external_call)) score += 15;

  // Tax scoring
  const buyTax = parseNum(raw.buy_tax);
  const sellTax = parseNum(raw.sell_tax);
  if (buyTax > 10 || sellTax > 10) score += 20;
  else if (buyTax > 5 || sellTax > 5) score += 10;
  else if (buyTax > 3 || sellTax > 3) score += 5;

  // Not open source
  if (!parseBool(raw.is_open_source)) score += 10;

  // Few holders = centralization risk
  const holders = parseNum(raw.holder_count);
  if (holders > 0 && holders < 50) score += 10;
  else if (holders > 0 && holders < 200) score += 5;

  // Owner has large balance
  const ownerBal = parseNum(raw.owner_balance);
  if (ownerBal > OWNER_BALANCE_THRESHOLD) score += 5;

  return Math.min(score, 100);
}

function riskLevel(score: number): TokenSecurity["riskLevel"] {
  if (score >= 70) return "critical";
  if (score >= 40) return "high";
  if (score >= 20) return "medium";
  if (score >= 5) return "low";
  return "safe";
}

function parseGoPlusResult(
  address: string,
  result: Record<string, string> | undefined
): TokenSecurity | null {
  if (!result || Object.keys(result).length === 0) return null;

  return {
    is_honeypot: parseBool(result.is_honeypot),
    is_open_source: parseBool(result.is_open_source),
    is_proxy: parseBool(result.is_proxy),
    is_mintable: parseBool(result.is_mintable),
    cannot_buy: parseBool(result.cannot_buy),
    cannot_sell_all: parseBool(result.cannot_sell_all),
    is_blacklisted: parseBool(result.is_blacklisted),
    is_whitelisted: parseBool(result.is_whitelisted),
    hidden_owner: parseBool(result.hidden_owner),
    selfdestruct: parseBool(result.selfdestruct),
    external_call: parseBool(result.external_call),
    transfer_pausable: parseBool(result.transfer_pausable),
    trading_cooldown: parseBool(result.trading_cooldown),
    anti_whale_modifiable: parseBool(result.anti_whale_modifiable),
    personal_slippage_modifiable: parseBool(result.personal_slippage_modifiable),
    owner_change_balance: parseBool(result.owner_change_balance),
    can_take_back_ownership: parseBool(result.can_take_back_ownership),
    is_airdrop_scam: parseBool(result.is_airdrop_scam),
    is_anti_whale: parseBool(result.is_anti_whale),
    buy_tax: parseNum(result.buy_tax),
    sell_tax: parseNum(result.sell_tax),
    holder_count: parseNum(result.holder_count),
    lp_holder_count: parseNum(result.lp_holder_count),
    lp_total_supply: parseNum(result.lp_total_supply),
    owner_address: result.owner_address ?? "",
    owner_balance: result.owner_balance ?? "",
    creator_address: result.creator_address ?? "",
    creator_balance: result.creator_balance ?? "",
    raw: result,
    riskScore: 0,
    riskLevel: "safe" as const,
  };
}

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
    const res = await fetch(
      `${GOPLUS_URL}/4663?contract_addresses=${parsed.data.address}`,
      { signal: AbortSignal.timeout(SECURITY_REQUEST_TIMEOUT_MS) }
    );

    if (!res.ok) {
      return NextResponse.json({ security: null, error: `GoPlus returned ${res.status}` });
    }

    const body = (await res.json()) as {
      code?: number;
      message?: string;
      result?: Record<string, Record<string, string>>;
    };

    if (body.code !== 1 || !body.result) {
      return NextResponse.json({ security: null, error: body.message || "No data" });
    }

    const raw = body.result[parsed.data.address];
    const security = parseGoPlusResult(parsed.data.address, raw);
    if (!security) {
      return NextResponse.json({ security: null, error: "Empty result" });
    }

    security.riskScore = computeRiskScore(raw);
    security.riskLevel = riskLevel(security.riskScore);

    return NextResponse.json({ security }, {
      headers: { "Cache-Control": "public, max-age=120, s-maxage=300" },
    });
  } catch (e) {
    return NextResponse.json(
      { security: null, error: String(e) },
      { status: 500 }
    );
  }
});
