/**
 * Robinhood Chain RPC client with multi-endpoint fallback + tiny cache.
 *
 * Why this exists:
 *  - The default viem-only chain config picks a single RPC URL. If that
 *    URL is rate-limited, blocked by region, or returns a stale snapshot,
 *    every on-chain read (balances, token info, swap quotes) silently
 *    fails and the UI shows 0 or hangs.
 *  - Robinhood Chain is an Arbitrum Orbit stack (chain ID 4663). Several
 *    providers expose it. We try them in order and remember the last
 *    working endpoint for the rest of the process lifetime, so we don't
 *    pay the latency of a dead RPC on every request.
 *  - Read-mostly endpoints benefit from a 2-3 second in-memory cache
 *    (balances in particular fire on every keystroke while typing).
 *
 * The module is server-only by intent — it instantiates a viem public
 * client and caches it. Don't import it from a `"use client"` file.
 */

import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { robinhoodViemChain } from "./chains";

/* ── RPC endpoint catalogue ────────────────────────────────────────
 * Order matters: the first reachable endpoint wins and is reused for
 * the rest of the process. Add new fallbacks to the END so a transient
 * outage at the top doesn't cascade to the whole stack.
 *
 *   1. NEXT_PUBLIC_RH_RPC_URL — the operator-supplied URL (may carry
 *      an Alchemy / Dwellir / Tenderly key).
 *   2. Robinhood's own public RPC (no key required).
 *   3. Publicnode / Dwellir community endpoint (no key required).
 *   4. Blockscout-style "no-node" fallback is intentionally omitted;
 *      we need a JSON-RPC node for eth_call / eth_getBalance.
 * ──────────────────────────────────────────────────────────────── */
const DEFAULT_RPCS = [
  // Operator-provided Alchemy key (highest rate limit / reliability).
  "https://robinhood-mainnet.g.alchemy.com/v2/qJtfjLqzeQL2yJ5NFXDjHNhtlyxwZyrD",
  // Official Robinhood-hosted public RPC (no key required).
  "https://rpc.mainnet.chain.robinhood.com",
  // Community-run fallback (no key required).
  "https://robinhood.drpc.org",
] as const;

function candidateEndpoints(): string[] {
  const fromEnv = process.env.NEXT_PUBLIC_RH_RPC_URL?.trim();
  const envRpcs = fromEnv ? [fromEnv] : [];
  return [...envRpcs, ...DEFAULT_RPCS].filter((u) => !!u);
}

/* ── Tiny per-process cache ────────────────────────────────────────
 * Avoid hammering the RPC when the user types into the swap input
 * (DirectSwap debounces 500ms but the balance hook fires once per
 * address change too).
 * ──────────────────────────────────────────────────────────────── */
const TTL_MS = 2_500;

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function setCached<T>(key: string, value: T, ttlMs = TTL_MS): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/* ── Client pool with sticky-last-good selection ─────────────────── */
type ClientSlot = { url: string; client: PublicClient };
let pool: ClientSlot[] | null = null;
let stickyIndex = 0;

function buildPool(): ClientSlot[] {
  return candidateEndpoints().map((url) => ({
    url,
    client: createPublicClient({ chain: robinhoodViemChain, transport: http(url) }),
  }));
}

function getPool(): ClientSlot[] {
  if (!pool) pool = buildPool();
  return pool;
}

/** Run `fn` against the RPC pool, walking fallbacks until one works. */
async function withRpc<T>(
  fn: (client: PublicClient, url: string) => Promise<T>,
  opts: { cacheKey?: string } = {}
): Promise<T> {
  if (opts.cacheKey) {
    const hit = getCached<T>(opts.cacheKey);
    if (hit !== undefined) return hit;
  }

  const slots = getPool();
  if (slots.length === 0) {
    throw new Error("No Robinhood Chain RPC endpoints configured");
  }

  // Start at stickyIndex so we usually hit the same healthy endpoint.
  // On failure, advance stickyIndex so the next call tries a different one.
  const start = stickyIndex % slots.length;
  let lastError: unknown = null;

  for (let i = 0; i < slots.length; i++) {
    const idx = (start + i) % slots.length;
    const slot = slots[idx];
    try {
      const value = await fn(slot.client, slot.url);
      stickyIndex = idx;
      if (opts.cacheKey) setCached(opts.cacheKey, value);
      return value;
    } catch (e) {
      lastError = e;
      // try next endpoint
    }
  }

  throw new Error(
    `All Robinhood Chain RPC endpoints failed (${slots.length} tried). Last error: ${String(
      (lastError as Error)?.message ?? lastError
    )}`
  );
}

/* ── Public helpers used by the wallet API routes ───────────────── */

export function getNativeBalance(address: Address): Promise<bigint> {
  return withRpc(
    (c) => c.getBalance({ address }),
    { cacheKey: `native:${address.toLowerCase()}` }
  );
}

export function readContractSafe<T>(args: {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  cacheKey?: string;
}): Promise<T> {
  return withRpc(
    (c) =>
      c.readContract({
        address: args.address,
        abi: args.abi as never,
        functionName: args.functionName,
        args: (args.args ?? []) as never,
      }) as Promise<T>,
    { cacheKey: args.cacheKey }
  );
}

/** Force the next call to re-pick the sticky endpoint. Test helper. */
export function _resetRpcState() {
  pool = null;
  stickyIndex = 0;
  cache.clear();
}