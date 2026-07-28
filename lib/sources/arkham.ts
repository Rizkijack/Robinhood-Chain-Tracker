/**
 * Arkham Intelligence data source for real-time token transaction tracking.
 *
 * API: https://api.arkm.com
 * Auth: API-Key header
 * Docs: https://docs.intel.arkm.com
 *
 * The /transfers endpoint returns enriched transfer data including:
 * - Transaction classification (transfer, swap, etc.)
 * - Entity attribution (wallet labels from Arkham's intelligence DB)
 * - USD valuations computed by Arkham's pricing engine
 * - Chain, block, and timestamp metadata
 *
 * Rate limit: Heavy endpoint — 1 req/sec. Server-side cache respects this.
 */

import { cached } from "../cache";
import type { TokenTransaction } from "../types";

const ARKHAM_BASE = "https://api.arkm.com";
const CACHE_TTL_MS = 8_000; // 8s cache (within 1 req/sec rate limit)
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** USD thresholds for whale tiers. */
const WHALE_THRESHOLD = 10_000;
const MEGA_WHALE_THRESHOLD = 50_000;

/** Chain identifier for Robinhood Chain on Arkham. */
const ARKHAM_CHAIN = "robinhood";

export interface FetchArkhamOptions {
  /** Pool/pair address used to classify buy vs sell. Optional. */
  pairAddress?: string | null;
  /** Token USD price — fallback for value calc if Arkham doesn't return it. */
  tokenPriceUsd?: number | null;
  /** Max number of transfers to fetch (default 50). */
  limit?: number;
}

/** Raw transfer object from Arkham /transfers response. */
interface ArkhamTransfer {
  transactionHash: string;
  blockNumber: number;
  timestamp: string; // ISO-8601
  fromAddress: string;
  toAddress: string;
  value: number; // human-readable token amount
  valueUsd?: number;
  tokenSymbol?: string;
  token?: {
    symbol?: string;
    name?: string;
    decimals?: number;
  };
  classification?: string; // "transfer", "swap", etc.
  fromEntity?: {
    name?: string;
    logo?: string;
  };
  toEntity?: {
    name?: string;
    logo?: string;
  };
  gasUsed?: number;
  gasPrice?: number;
  method?: string;
}

interface ArkhamTransfersResponse {
  transfers: ArkhamTransfer[];
  count?: number;
}

/**
 * Fetch recent token transfers from Arkham Intelligence.
 *
 * Returns normalized `TokenTransaction[]` newest-first, with Arkham's
 * entity attribution (wallet labels) included when available.
 */
export async function fetchArkhamTokenTransfers(
  tokenAddress: string,
  options: FetchArkhamOptions = {}
): Promise<TokenTransaction[]> {
  const addr = tokenAddress.toLowerCase();
  const pair = options.pairAddress?.toLowerCase();
  const price = options.tokenPriceUsd;
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));

  const apiKey = process.env.ARKHAM_API_KEY;
  if (!apiKey) {
    throw new Error("ARKHAM_API_KEY not configured");
  }

  const cacheKey = `arkham:txns:${addr}:${pair || "all"}:${limit}`;
  return cached(cacheKey, CACHE_TTL_MS, async () => {
    // Build the transfers URL with filters
    const params = new URLSearchParams({
      chain: ARKHAM_CHAIN,
      token: addr,
      limit: String(limit),
      sort: "time",
      order: "desc",
    });

    const url = `${ARKHAM_BASE}/transfers?${params.toString()}`;

    let data: ArkhamTransfersResponse;
    try {
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

      data = (await res.json()) as ArkhamTransfersResponse;
    } catch (err) {
      console.error("[arkham] Failed to fetch transfers:", err);
      throw err;
    }

    const transfers = data.transfers || [];
    return transfers
      .map((tx) => normalizeArkhamTransfer(tx, { pair, price, tokenAddress: addr }))
      .filter((tx): tx is TokenTransaction => tx !== null)
      .sort((a, b) => b.timestamp - a.timestamp);
  });
}

interface NormalizeOpts {
  pair?: string;
  price?: number | null;
  tokenAddress: string;
}

/**
 * Convert a single Arkham transfer into a normalized `TokenTransaction`.
 */
function normalizeArkhamTransfer(
  raw: ArkhamTransfer,
  opts: NormalizeOpts
): TokenTransaction | null {
  try {
    const hash = raw.transactionHash?.trim();
    if (!hash) return null;

    // Timestamp: Arkham returns ISO-8601 strings.
    const ts = new Date(raw.timestamp).getTime();
    if (!Number.isFinite(ts) || ts <= 0) return null;

    // Token amount: Arkham returns human-readable values.
    const tokenAmount = Number.isFinite(raw.value) ? Number(raw.value) : 0;

    const from = (raw.fromAddress || "").toLowerCase();
    const to = (raw.toAddress || "").toLowerCase();

    // USD value: prefer Arkham's own computation.
    let usdValue = Number.isFinite(raw.valueUsd) ? Number(raw.valueUsd) : 0;

    // Fallback: compute from amount * caller-provided price.
    if (usdValue <= 0 && opts.price != null && Number.isFinite(opts.price) && tokenAmount > 0) {
      usdValue = tokenAmount * opts.price;
    }

    // Classify transaction type.
    let kind: TokenTransaction["type"];
    let trader: string;
    let entity: string | undefined;
    let entityLogo: string | undefined;

    if (from === ZERO_ADDRESS) {
      kind = "mint";
      trader = to;
      entity = raw.toEntity?.name;
      entityLogo = raw.toEntity?.logo;
    } else if (to === ZERO_ADDRESS) {
      kind = "burn";
      trader = from;
      entity = raw.fromEntity?.name;
      entityLogo = raw.fromEntity?.logo;
    } else if (opts.pair) {
      if (to === opts.pair) {
        // Token going TO pool = user is selling
        kind = "sell";
        trader = from;
        entity = raw.fromEntity?.name;
        entityLogo = raw.fromEntity?.logo;
      } else if (from === opts.pair) {
        // Token coming FROM pool = user is buying
        kind = "buy";
        trader = to;
        entity = raw.toEntity?.name;
        entityLogo = raw.toEntity?.logo;
      } else {
        kind = classifyFromArkham(raw);
        trader = from;
        entity = raw.fromEntity?.name;
        entityLogo = raw.fromEntity?.logo;
      }
    } else {
      kind = classifyFromArkham(raw);
      trader = from;
      entity = raw.fromEntity?.name;
      entityLogo = raw.fromEntity?.logo;
    }

    // Gas: Arkham may provide gasUsed and gasPrice directly.
    const gasUsed = Number.isFinite(raw.gasUsed) ? Number(raw.gasUsed) : undefined;
    let gasFee: number | undefined;
    if (gasUsed && Number.isFinite(raw.gasPrice)) {
      gasFee = (gasUsed * Number(raw.gasPrice)) / 1e18;
    }

    const symbol = raw.tokenSymbol || raw.token?.symbol || "TOKEN";

    return {
      hash,
      type: kind,
      trader,
      tokenAmount,
      tokenSymbol: symbol,
      usdValue,
      timestamp: ts,
      gasUsed,
      gasFee: gasFee && Number.isFinite(gasFee) ? gasFee : undefined,
      dexName: kind === "buy" || kind === "sell" ? "Uniswap" : undefined,
      blockNumber: raw.blockNumber ? String(raw.blockNumber) : undefined,
      isWhale: usdValue >= WHALE_THRESHOLD,
      isMegaWhale: usdValue >= MEGA_WHALE_THRESHOLD,
      entity,
      entityLogo,
    };
  } catch {
    return null;
  }
}

/**
 * Use Arkham's own classification metadata to determine tx type.
 * Falls back to "transfer" when classification is ambiguous.
 */
function classifyFromArkham(raw: ArkhamTransfer): TokenTransaction["type"] {
  const cls = (raw.classification || "").toLowerCase();
  const method = (raw.method || "").toLowerCase();

  // Arkham classifies swaps explicitly.
  if (cls === "swap" || method.includes("swap")) {
    // For swaps, determine direction by looking at method name.
    if (method.includes("sell") || method.includes("exacttoken")) {
      return "sell";
    }
    return "buy"; // default swap direction
  }

  // Known swap method selectors.
  const SWAP_SELECTORS = new Set([
    "04e45aaf", "c04b8d59", "fb3bdb41", "7ff36ab5",
    "18cbafe5", "38ed1739", "791ac947", "5c11d795", "b6b55f25",
  ]);

  // Check if the method selector indicates a swap (first 4 bytes = 8 hex chars after 0x)
  // This is a rough heuristic — the method field may already be the selector.
  if (method && method.length >= 10) {
    const selector = method.slice(2, 10).toLowerCase();
    if (SWAP_SELECTORS.has(selector)) return "buy";
  }

  return "transfer";
}

/**
 * Fetch transfers attributed to a specific Arkham entity.
 */
export async function fetchArkhamEntityTransfers(
  entityName: string,
  options: { limit?: number } = {}
): Promise<TokenTransaction[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const apiKey = process.env.ARKHAM_API_KEY;
  if (!apiKey) throw new Error("ARKHAM_API_KEY not configured");

  const cacheKey = `arkham:entity:${entityName}:${limit}`;
  return cached(cacheKey, CACHE_TTL_MS, async () => {
    const params = new URLSearchParams({
      chain: ARKHAM_CHAIN,
      entity: entityName,
      limit: String(limit),
      sort: "time",
      order: "desc",
    });

    const res = await fetch(`${ARKHAM_BASE}/transfers?${params.toString()}`, {
      headers: { Accept: "application/json", "API-Key": apiKey },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Arkham API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as ArkhamTransfersResponse;
    return (data.transfers || [])
      .map((tx) => normalizeArkhamTransfer(tx, { tokenAddress: "" }))
      .filter((tx): tx is TokenTransaction => tx !== null)
      .sort((a, b) => b.timestamp - a.timestamp);
  });
}

/**
 * Fetch transfers for a specific wallet address.
 */
export async function fetchArkhamWalletTransfers(
  address: string,
  options: { limit?: number } = {}
): Promise<TokenTransaction[]> {
  const addr = address.toLowerCase();
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const apiKey = process.env.ARKHAM_API_KEY;
  if (!apiKey) throw new Error("ARKHAM_API_KEY not configured");

  const cacheKey = `arkham:wallet:${addr}:${limit}`;
  return cached(cacheKey, CACHE_TTL_MS, async () => {
    const params = new URLSearchParams({
      chain: ARKHAM_CHAIN,
      address: addr,
      limit: String(limit),
      sort: "time",
      order: "desc",
    });

    const res = await fetch(`${ARKHAM_BASE}/transfers?${params.toString()}`, {
      headers: { Accept: "application/json", "API-Key": apiKey },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Arkham API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as ArkhamTransfersResponse;
    return (data.transfers || [])
      .map((tx) => normalizeArkhamTransfer(tx, { tokenAddress: "" }))
      .filter((tx): tx is TokenTransaction => tx !== null)
      .sort((a, b) => b.timestamp - a.timestamp);
  });
}

/**
 * Fetch all whale transfers (no token filter) for flow analytics.
 */
export async function fetchArkhamWhaleTransfers(
  options: { limit?: number; minValueUsd?: number } = {}
): Promise<TokenTransaction[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 200, 200));
  const minUsd = options.minValueUsd ?? WHALE_THRESHOLD;
  const apiKey = process.env.ARKHAM_API_KEY;
  if (!apiKey) throw new Error("ARKHAM_API_KEY not configured");

  const cacheKey = `arkham:whales:${limit}:${minUsd}`;
  return cached(cacheKey, CACHE_TTL_MS, async () => {
    const params = new URLSearchParams({
      chain: ARKHAM_CHAIN,
      minValueUsd: String(minUsd),
      limit: String(limit),
      sort: "time",
      order: "desc",
    });

    const res = await fetch(`${ARKHAM_BASE}/transfers?${params.toString()}`, {
      headers: { Accept: "application/json", "API-Key": apiKey },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Arkham API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as ArkhamTransfersResponse;
    return (data.transfers || [])
      .map((tx) => normalizeArkhamTransfer(tx, { tokenAddress: "" }))
      .filter((tx): tx is TokenTransaction => tx !== null)
      .sort((a, b) => b.timestamp - a.timestamp);
  });
}

/**
 * Build the Arkham Intelligence URL for a specific address.
 */
export function arkhamAddressUrl(address: string): string {
  return `https://platform.arkhamintelligence.com/address/${address}`;
}

/**
 * Build the Arkham Intelligence URL for a specific transaction.
 */
export function arkhamTxUrl(hash: string): string {
  return `https://platform.arkhamintelligence.com/tx/${hash}`;
}
