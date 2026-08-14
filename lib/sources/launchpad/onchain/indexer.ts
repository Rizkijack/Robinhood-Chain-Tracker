/**
 * On-chain launchpad indexer — scans factory launch events and converts
 * them into `LaunchpadToken[]`.
 *
 * Flow per platform:
 *   1. Read last-scanned block (Upstash Redis cursor).
 *   2. Fetch the current block number.
 *   3. eth_getLogs in bounded chunks (public RPC times out on wide ranges).
 *   4. Decode events, derive tokens, persist the new cursor.
 *
 * New tokens carry `launchBlock`; callers may resolve block → timestamp
 * lazily (via `resolveLaunchTimestamps`).
 */

import { createPublicClient, http } from "viem";
import { robinhoodViemChain, ROBINHOOD_RPC_URL } from "../../../chains";
import { getLogsChunked } from "./rpc-logs";
import { getLastScannedBlock, setLastScannedBlock } from "./store";
import { enabledOnchainPlatforms, type OnchainPlatformConfig } from "./contracts";
import { fetchDexBatchTokens } from "../../dexscreener";
import type { LaunchpadToken } from "../types";

/**
 * Blocks to scan per platform per run. Each run advances AT MOST this many
 * blocks per platform (~one ~3.5s chunk against the public RPC), while the
 * chain produces ~864k blocks/day. So a single daily cron run can only
 * advance up to 100k blocks per platform — keeping the index fully current
 * requires the local backfill script (scripts/launchpad-backfill.mjs) or
 * more frequent runs. The cron's job is to keep the index alive (extend the
 * TTL) and advance cursors best-effort.
 */
const MAX_SCAN_BLOCKS = 100_000;

/** Tokens whose market cap never reached this are dropped (not tracked). */
export const MIN_MARKET_CAP_USD = 10_000;

/** Default scan start: 7 days back (block time ~0.1s → ~6M blocks). */
const DEFAULT_LOOKBACK_BLOCKS = 6_000_000;

/**
 * Scan a single platform factory for new launch events since the last
 * cursor. Returns newly-detected tokens (newest first).
 */
export async function scanPlatformLaunches(
  config: OnchainPlatformConfig,
  currentBlock: number
): Promise<LaunchpadToken[]> {
  const stored = await getLastScannedBlock(config.id, 0);
  // If no cursor yet, start ~7 days back (not from deploy block — we
  // only care about recent launches).
  const fallbackStart = Math.max(config.deployBlock, currentBlock - DEFAULT_LOOKBACK_BLOCKS);
  const fromBlock = Math.max(stored || fallbackStart, config.deployBlock);
  const toBlock = Math.min(currentBlock, fromBlock + MAX_SCAN_BLOCKS);

  if (fromBlock >= toBlock) return [];

  const logs = await getLogsChunked(
    config.factory,
    config.event,
    BigInt(fromBlock),
    BigInt(toBlock)
  );

  const tokens: LaunchpadToken[] = [];
  for (const log of logs) {
    const t = config.toToken(log.args, log.blockNumber);
    if (t) tokens.push(t);
  }

  // Persist cursor even if no events found (advance past scanned range).
  await setLastScannedBlock(config.id, toBlock);

  return tokens.sort((a, b) => (b.launchBlock ?? 0) - (a.launchBlock ?? 0));
}

/** Current head block of Robinhood Chain. */
export async function getCurrentBlock(): Promise<number> {
  const client = createPublicClient({
    chain: robinhoodViemChain,
    transport: http(ROBINHOOD_RPC_URL),
  });
  const n = await client.getBlockNumber();
  return Number(n);
}

/**
 * Fetch the latest launches across ALL on-chain platforms (Phase 2).
 * Best-effort: a failing platform is skipped and reported.
 */
export async function fetchOnchainLaunches(): Promise<{
  tokens: LaunchpadToken[];
  errors: { platform: string; message: string }[];
}> {
  const errors: { platform: string; message: string }[] = [];
  const tokens: LaunchpadToken[] = [];
  const seen = new Set<string>();

  let currentBlock: number;
  try {
    currentBlock = await getCurrentBlock();
  } catch (e) {
    return { tokens: [], errors: [{ platform: "onchain", message: `RPC unavailable: ${String(e).slice(0, 120)}` }] };
  }

  for (const config of enabledOnchainPlatforms()) {
    try {
      const found = await scanPlatformLaunches(config, currentBlock);
      for (const t of found) {
        if (!seen.has(t.tokenAddress)) {
          seen.add(t.tokenAddress);
          tokens.push(t);
        }
      }
    } catch (e) {
      errors.push({ platform: config.id, message: String(e).slice(0, 200) });
    }
  }

  // Market-cap filter: only keep tokens whose DexScreener market cap is
  // at least MIN_MARKET_CAP_USD (or unknown — unknown is kept so a
  // temporary DexScreener hiccup doesn't wipe the index).
  const filtered = await filterByMarketCap(tokens, errors);

  filtered.sort((a, b) => (b.launchBlock ?? 0) - (a.launchBlock ?? 0));
  return { tokens: filtered, errors };
}

/**
 * Batch-check token market caps via DexScreener's /tokens/v1 batch
 * endpoint (30 addresses per call) and drop tokens that never reached
 * the minimum. Tokens DexScreener doesn't know are kept (best-effort —
 * they may simply be too new or the API hiccuped).
 */
export async function filterByMarketCap(
  tokens: LaunchpadToken[],
  errors: { platform: string; message: string }[]
): Promise<LaunchpadToken[]> {
  if (!tokens.length) return tokens;

  const kept: LaunchpadToken[] = [];
  const batchSize = 30;

  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    try {
      const map = await fetchDexBatchTokens(
        batch.map((t) => t.tokenAddress),
        batchSize
      );
      for (const token of batch) {
        const pair = map.get(token.tokenAddress);
        const marketCap = pair?.marketCap ?? null;
        // Keep when mcap is unknown OR meets the threshold.
        if (marketCap == null || marketCap >= MIN_MARKET_CAP_USD) {
          kept.push(token);
        }
      }
    } catch (e) {
      // DexScreener batch failed — keep the whole batch rather than lose data.
      errors.push({ platform: "onchain-mcap", message: `mcap filter failed: ${String(e).slice(0, 120)}` });
      kept.push(...batch);
    }
  }

  return kept;
}

/** Resolve block numbers to unix timestamps (batched, cached per block). */
const blockTimeCache = new Map<number, number | null>();

export async function resolveLaunchTimestamps(
  tokens: LaunchpadToken[]
): Promise<LaunchpadToken[]> {
  // Cap the block→timestamp cache: it's a pure cache keyed by block number,
  // so dropping it entirely is safe and prevents unbounded growth across
  // many cron runs in a long-lived process.
  if (blockTimeCache.size > 10_000) blockTimeCache.clear();

  const client = createPublicClient({
    chain: robinhoodViemChain,
    transport: http(ROBINHOOD_RPC_URL),
  });

  const blocks = [...new Set(tokens.map((t) => t.launchBlock).filter((b): b is number => b != null))];
  const times = new Map<number, number | null>();

  for (const b of blocks) {
    if (blockTimeCache.has(b)) {
      times.set(b, blockTimeCache.get(b) ?? null);
      continue;
    }
    try {
      // Cast needed: viem's getBlock typing is strict about the custom
      // chain's block type; the actual shape is the standard one.
      const block = (await client.getBlock({ blockNumber: BigInt(b) })) as {
        timestamp?: bigint;
      };
      const ts = block.timestamp != null ? Number(block.timestamp) * 1000 : null;
      blockTimeCache.set(b, ts);
      times.set(b, ts);
    } catch {
      times.set(b, null);
    }
  }

  return tokens.map((t) => {
    if (t.launchBlock == null) return t;
    const ts = times.get(t.launchBlock);
    if (ts == null) return t;
    return { ...t, launchTimeMs: ts, ageMs: Date.now() - ts };
  });
}
