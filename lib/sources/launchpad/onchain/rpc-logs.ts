/**
 * Chunked `eth_getLogs` scanning for the on-chain launchpad indexer.
 *
 * The Robinhood public RPC times out on wide `eth_getLogs` ranges, so
 * every scan is split into bounded block chunks (default 2,000 blocks),
 * each with its own timeout and backoff. This module builds on the
 * existing `lib/rpc.ts` pool (multi-endpoint fallback + sticky).
 */

import { createPublicClient, http, type Address, type PublicClient, type AbiEvent } from "viem";
import { robinhoodViemChain, ROBINHOOD_RPC_URL } from "../../../chains";
import { getLastScannedBlock } from "./store";
import type { LaunchpadSourceId } from "../types";

// Chunk size: tested against the public RPC — ~100k-block chunks with
// ~2k logs return in ~3.5s. Larger ranges with many logs fail with
// "Missing or invalid parameters" (response too large), so 100k is the
// sweet spot for the 30s serverless budget.
const CHUNK_SIZE = 100_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 800;

/** A single decoded event from the indexer. */
export interface DecodedLog {
  /** Block number where the event was emitted. */
  blockNumber: number;
  /** Raw event args (decoded by viem). */
  args: Record<string, unknown>;
}

export interface ScanRange {
  fromBlock: bigint;
  toBlock: bigint;
}

/**
 * Fetch + decode all matching logs in [fromBlock, toBlock], chunked.
 * Skips empty/zero-address topics when a `topics` filter is provided.
 */
export async function getLogsChunked(
  address: Address,
  event: AbiEvent,
  fromBlock: bigint,
  toBlock: bigint,
  topics?: (string | null)[]
): Promise<DecodedLog[]> {
  const client = createPublicClient({
    chain: robinhoodViemChain,
    transport: http(ROBINHOOD_RPC_URL),
  });

  const out: DecodedLog[] = [];
  let cursor = fromBlock;

  while (cursor <= toBlock) {
    const end = cursor + BigInt(CHUNK_SIZE) - 1n > toBlock ? toBlock : cursor + BigInt(CHUNK_SIZE) - 1n;
    const range = { fromBlock: cursor, toBlock: end };
    const logs = await withRetry(() => fetchLogsOnce(client, address, event, range, topics));
    out.push(...logs);
    cursor = end + 1n;
    // Small pause between chunks to be kind to the public RPC.
    if (cursor <= toBlock) await sleep(150);
  }

  return out;
}

async function fetchLogsOnce(
  client: PublicClient,
  address: Address,
  event: AbiEvent,
  range: ScanRange,
  topics?: (string | null)[]
): Promise<DecodedLog[]> {
  const logs = await client.getLogs({
    address,
    event,
    fromBlock: range.fromBlock,
    toBlock: range.toBlock,
    ...(topics ? { topics } : {}),
  });
  return logs
    .map((l) => ({
      blockNumber: Number(l.blockNumber),
      args: (l.args ?? {}) as Record<string, unknown>,
    }))
    .filter((l) => l.blockNumber > 0);
}

/** Retry a chunk fetch with exponential backoff on failure. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES - 1) await sleep(BASE_BACKOFF_MS * 2 ** attempt);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Default deploy block for platforms that don't publish one. */
export const DEFAULT_DEPLOY_BLOCK = 7_700_000;

/** Resolve the scan start: stored cursor, else the platform deploy block. */
export async function resolveScanStart(
  platform: LaunchpadSourceId,
  deployBlock: number
): Promise<bigint> {
  const stored = await getLastScannedBlock(platform, deployBlock);
  return BigInt(Math.max(stored, deployBlock));
}
