/**
 * Robinhood Chain Explorer (Blockscout) data source.
 *
 * Public REST endpoint: https://robinhoodchain.blockscout.com
 * Uses the Etherscan-compatible v1 API
 *   GET /api?module=account&action=tokentx&contractaddress={token}&...
 * which on this Blockscout instance is the only endpoint that reliably
 * returns per-token transfer history. The v2 /api/v2/... endpoints
 * for this chain currently return empty/500 for several active tokens.
 *
 * Each response item is a single ERC-20 transfer event. A swap appears
 * as two transfers in a row (token out of pool, ETH/WETH into pool).
 * We classify buy/sell by checking if a known pair/pool address is the
 * counterparty on the transfer.
 *
 * All amounts and gas values in the source are returned as decimal
 * strings; this module converts to numbers and returns a normalized
 * `TokenTransaction` shape ready for the UI.
 */

import { CHAIN, WHALE_THRESHOLD_USD, MEGA_WHALE_THRESHOLD_USD, TX_CACHE_TTL_MS } from "../constants";
import { cached } from "../cache";
import type { TokenTransaction } from "../types";

export const BLOCKSCOUT_BASE = CHAIN.explorer;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** How many transfers to pull per page. */
const PAGE_SIZE = 50;

export interface BlockscoutV1Transfer {
  blockNumber: string;
  timeStamp: string; // unix seconds (decimal string, e.g. "1785116378")
  hash: string;
  nonce: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string;
  value: string; // raw token amount in base units (e.g. 18-decimals)
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string;
  contractAddress: string;
  methodId?: string;
  functionName?: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
}

interface BlockscoutV1Response {
  status: string; // "1" success, "0" error
  message: string;
  result: BlockscoutV1Transfer[] | string;
}

export interface FetchBlockscoutOptions {
  /** Pool/pair address used to classify buy/sell. Optional. */
  pairAddress?: string | null;
  /** Token USD price — used for value calc when API doesn't return it. */
  tokenPriceUsd?: number | null;
  /** Number of pages (50 transfers each) to fetch. */
  pages?: number;
}

/**
 * Fetch + normalize all transfers of a single token from Robinhood Explorer.
 *
 * Returns a fresh array on every call (no internal mutation), newest first.
 * `kind` is inferred:
 *   - "buy"   – token going from a known pool → user
 *   - "sell"  – token going from user → a known pool
 *   - "mint"  – from == 0x0
 *   - "burn"  – to == 0x0
 *   - "transfer" – everything else (peer-to-peer)
 */
export async function fetchBlockscoutTokenTransfers(
  tokenAddress: string,
  options: FetchBlockscoutOptions = {}
): Promise<TokenTransaction[]> {
  const addr = tokenAddress.toLowerCase();
  const pages = Math.max(2, Math.min(options.pages ?? 3, 6));
  const pair = options.pairAddress?.toLowerCase();
  const price = options.tokenPriceUsd;

  // Price is part of the key: USD values are computed from it, so two
  // callers with different prices must not share a cached payload.
  const priceKey = price != null ? price : "np";
  const cacheKey = `blockscout:txns:v3:${addr}:${pair || "all"}:${pages}:${priceKey}`;
  return cached(cacheKey, TX_CACHE_TTL_MS, async () => {
    const all: BlockscoutV1Transfer[] = [];
    for (let page = 1; page <= pages; page++) {
      const url =
        `${BLOCKSCOUT_BASE}/api` +
        `?module=account&action=tokentx` +
        `&contractaddress=${addr}` +
        `&page=${page}&offset=${PAGE_SIZE}&sort=desc`;

      let data: BlockscoutV1Response;
      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          // Don't blow up the whole feed on a single page failure.
          break;
        }
        data = (await res.json()) as BlockscoutV1Response;
      } catch {
        break;
      }

      if (data.status !== "1" || !Array.isArray(data.result)) break;
      all.push(...(data.result as BlockscoutV1Transfer[]));
      if ((data.result as BlockscoutV1Transfer[]).length < PAGE_SIZE) break;
    }

    return all
      .map((tx) => normalizeTransfer(tx, { pair, price, tokenAddress: addr }))
      .filter((tx): tx is TokenTransaction => tx !== null)
      .sort((a, b) => b.timestamp - a.timestamp);
  });
}

interface NormalizeOpts {
  pair?: string;
  price?: number | null;
  tokenAddress: string;
}

/** Convert a single raw V1 transfer into the UI-facing `TokenTransaction`. */
function normalizeTransfer(
  raw: BlockscoutV1Transfer,
  opts: NormalizeOpts
): TokenTransaction | null {
  try {
    if (!raw.hash) return null;

    // Timestamp: API gives unix SECONDS. Convert to MS once, correctly.
    const tsSec = Number.parseInt(raw.timeStamp, 10);
    if (!Number.isFinite(tsSec) || tsSec <= 0) return null;
    const timestamp = tsSec * 1000;

    // Token amount: raw value is in base units, divide by 10^decimals.
    const decimals = Number.parseInt(raw.tokenDecimal || "18", 10) || 18;
    const rawValue = raw.value || "0";
    const tokenAmount = toHumanAmount(rawValue, decimals);

    const from = (raw.from || "").toLowerCase();
    const to = (raw.to || "").toLowerCase();

    // Classify the kind of transfer.
    let kind: TokenTransaction["type"];
    let trader: string;
    let dexName: string | undefined;

    if (from === ZERO_ADDRESS) {
      kind = "mint";
      trader = to;
    } else if (to === ZERO_ADDRESS) {
      kind = "burn";
      trader = from;
    } else if (opts.pair) {
      // Known pool: direction relative to the pool determines buy/sell.
      // ERC-20 Transfer(from, to): a BUY is the pool sending token to the
      // user (from === pool), a SELL is the user sending token to the pool
      // (to === pool).
      if (from === opts.pair) {
        kind = "buy"; // token leaves pool → user receives it
        trader = to;
        dexName = "Uniswap";
      } else if (to === opts.pair) {
        kind = "sell"; // token enters pool → user sent it
        trader = from;
        dexName = "Uniswap";
      } else {
        kind = "transfer";
        trader = from;
      }
    } else {
      // No pool known: best-effort. If method is a known swap selector,
      // default to "buy" and pick the recipient as trader; otherwise a
      // plain "transfer" with sender as trader.
      kind = isSwapMethod(raw.methodId, raw.functionName) ? "buy" : "transfer";
      trader = from;
    }

    // USD value. The V1 API does not return USD; we compute from amount * price.
    const usdValue =
      opts.price != null && Number.isFinite(opts.price) && tokenAmount > 0
        ? tokenAmount * opts.price
        : 0;

    // Gas: gasUsed * gasPrice, in ETH (wei → ETH).
    const gasUsed = Number.parseInt(raw.gasUsed || "0", 10) || 0;
    const gasPrice = Number.parseInt(raw.gasPrice || "0", 10) || 0;
    const gasFeeWei = gasUsed * gasPrice;
    const gasFeeEth = gasFeeWei / 1e18;

    return {
      hash: raw.hash,
      type: kind,
      trader,
      from,
      to,
      tokenAmount,
      tokenSymbol: raw.tokenSymbol || "TOKEN",
      usdValue,
      timestamp,
      gasUsed: gasUsed || undefined,
      gasFee: Number.isFinite(gasFeeEth) ? gasFeeEth : undefined,
      dexName,
      blockNumber: raw.blockNumber,
      isWhale: usdValue >= WHALE_THRESHOLD_USD,
      isMegaWhale: usdValue >= MEGA_WHALE_THRESHOLD_USD,
    };
  } catch {
    return null;
  }
}

/** Convert a base-units decimal string into a human-readable number. */
function toHumanAmount(raw: string, decimals: number): number {
  // BigInt-safe path to avoid precision loss for huge supply tokens.
  try {
    const bi = BigInt(raw);
    const denom = 10n ** BigInt(decimals);
    const whole = bi / denom;
    const frac = bi % denom;
    // Keep up to 6 decimals of the fractional part as a number.
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 6);
    const fracNum = fracStr ? Number(fracStr) / 1e6 : 0;
    return Number(whole) + fracNum;
  } catch {
    // Fallback: floating point. Acceptable for very small amounts only.
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return n / Math.pow(10, decimals);
  }
}

/** Detect known swap selectors so we can default to "buy" when no pool. */
const SWAP_SELECTORS = new Set([
  "04e45aaf", // exactInputSingle (Uniswap v3)
  "c04b8d59", // exactInput (Uniswap v3)
  "fb3bdb41", // swapETHForExactTokens (Uniswap v2)
  "7ff36ab5", // swapExactETHForTokens (Uniswap v2)
  "18cbafe5", // swapExactTokensForETH (Uniswap v2)
  "38ed1739", // swapExactTokensForTokens (Uniswap v2)
  "791ac947", // swap (PancakeSwap / generic)
  "5c11d795", // swapExactTokensForETHSupportingFeeOnTransferTokens
  "b6b55f25", // deposit (some routers)
]);

function isSwapMethod(methodId?: string, functionName?: string): boolean {
  if (methodId && SWAP_SELECTORS.has(methodId.toLowerCase())) return true;
  if (!functionName) return false;
  const f = functionName.toLowerCase();
  return f.startsWith("swap") || f.includes("exactinput") || f.includes("exactoutput");
}

/**
 * Build the Robinhood Explorer URL for a given transaction hash.
 * Used as the per-row link in the transaction stream.
 */
export function blockscoutTxUrl(hash: string): string {
  return `${BLOCKSCOUT_BASE}/tx/${hash}`;
}

/** Build the explorer URL for the token contract address page. */
export function blockscoutAddressUrl(address: string): string {
  return `${BLOCKSCOUT_BASE}/address/${address}`;
}
