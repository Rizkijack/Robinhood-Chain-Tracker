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
import { ONCHAIN_PLATFORMS, type OnchainPlatformConfig } from "./contracts";
import type { LaunchpadToken } from "../types";

/** Max blocks to scan per platform per run (keeps cron runs bounded). */
const MAX_SCAN_BLOCKS = 100_000;

/**
 * Scan a single platform factory for new launch events since the last
 * cursor. Returns newly-detected tokens (newest first).
 */
export async function scanPlatformLaunches(
  config: OnchainPlatformConfig,
  currentBlock: number
): Promise<LaunchpadToken[]> {
  const from = await getLastScannedBlock(config.id, config.deployBlock);
  const fromBlock = Math.max(from, config.deployBlock);
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

  for (const config of ONCHAIN_PLATFORMS) {
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

  tokens.sort((a, b) => (b.launchBlock ?? 0) - (a.launchBlock ?? 0));
  return { tokens, errors };
}

/** Resolve block numbers to unix timestamps (batched, cached per block). */
const blockTimeCache = new Map<number, number | null>();

export async function resolveLaunchTimestamps(
  tokens: LaunchpadToken[]
): Promise<LaunchpadToken[]> {
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
