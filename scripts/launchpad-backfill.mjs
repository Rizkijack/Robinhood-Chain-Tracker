#!/usr/bin/env node
/**
 * One-time local backfill for the on-chain launchpad indexer.
 *
 * Scans every Phase-2 platform factory from its deploy block up to the
 * current head, decoding launch events, and stores the resulting token
 * index + last-scanned cursors in Upstash Redis. After this completes,
 * the Vercel daily cron only needs to keep up with new launches.
 *
 * Usage:
 *   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
 *     node scripts/launchpad-backfill.mjs
 *
 * Options:
 *   --platform=<id>   Backfill a single platform (default: all 6)
 *   --chunk=<n>       Blocks per eth_getLogs call (default 2000)
 *   --dry-run         Print what would be scanned without writing
 *
 * Requires: node >= 18, the repo's node_modules installed.
 */

import { createPublicClient, http, parseAbiItem } from "viem";
import { Redis } from "@upstash/redis";

const RPC = process.env.RH_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// ── Same registry as lib/sources/launchpad/onchain/contracts.ts ──
// (kept inline so the script runs without TS compilation)
const PLATFORMS = [
  {
    id: "pons",
    factory: "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB",
    event: "event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)",
    deployBlock: 8991118,
  },
  {
    id: "ponsv2",
    factory: "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e",
    event: "event TokenLaunched(address indexed token, address indexed deployer)",
    deployBlock: 7500000,
  },
  {
    id: "flap",
    factory: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09",
    event: "event TokenCreated(address indexed token, address indexed creator)",
    deployBlock: 7500000,
  },
  {
    id: "trench",
    factory: "0x77dC6f6361b7b99456FC3761ce5b7ddA80d83f9d",
    event: "event TokenCreate(address indexed creator, address curve, address token, address quote, string name, string symbol, uint256 timestamp, string tokenURI)",
    deployBlock: 7500000,
  },
  {
    id: "bow",
    factory: "0x229Faa919ABf14279E2461Dba53F039c5B4C7E29",
    event: "event Launched(address indexed token, address indexed deployer, uint8 indexed version, uint8 slotId, address pool, bytes32 poolId, uint256 positionId, uint256 launchId)",
    deployBlock: 7500000,
  },
  {
    id: "bags",
    factory: "0xe8Cc4431adF8b5A847C113EF0c6af9043219Cb37",
    event: "event TokenCreated(address indexed token, address indexed creator)",
    deployBlock: 7887312,
  },
];

const args = process.argv.slice(2);
const arg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : undefined;
};
const platformFilter = arg("platform");
const chunkSize = Number(arg("chunk") || 2000);
const dryRun = args.includes("--dry-run");

const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;
const PREFIX = "rh:lp:onchain:";
const INDEX_KEY = "rh:launchpad:onchain:index";

const client = createPublicClient({
  chain: {
    id: 4663,
    name: "Robinhood Chain",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  },
  transport: http(RPC),
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scanPlatform(p) {
  const stored = redis ? await redis.get(`${PREFIX}${p.id}`) : null;
  let from = Number(stored) || p.deployBlock;
  const head = Number(await client.getBlockNumber());
  let to = head;

  console.log(`\n=== ${p.id} ===`);
  console.log(`  factory:     ${p.factory}`);
  console.log(`  from:        ${from} (deploy ${p.deployBlock})`);
  console.log(`  to:          ${to} (head)`);
  console.log(`  blocks:      ${to - from} (${chunkSize}/chunk → ${Math.ceil((to - from) / chunkSize)} calls)`);

  let tokens = [];
  let cursor = from;
  let calls = 0;

  while (cursor < to) {
    const end = Math.min(cursor + chunkSize - 1, to);
    calls++;
    try {
      const logs = await client.getLogs({
        address: p.factory,
        event: parseEvent(p.event),
        fromBlock: BigInt(cursor),
        toBlock: BigInt(end),
      });
      for (const l of logs) {
        const argsObj = l.args || {};
        const token = String(argsObj.token || "").toLowerCase();
        if (token && token.startsWith("0x")) {
          tokens.push({ token, block: Number(l.blockNumber) });
        }
      }
      if (calls % 25 === 0) {
        console.log(`  ...${calls} calls, ${tokens.length} tokens (block ${end})`);
      }
      cursor = end + 1;
      await sleep(120);
    } catch (e) {
      console.error(`  !! chunk ${cursor}-${end} failed: ${String(e).slice(0, 120)}`);
      await sleep(1500);
      // Retry once with smaller chunk
      try {
        const logs = await client.getLogs({
          address: p.factory,
          event: parseEvent(p.event),
          fromBlock: BigInt(cursor),
          toBlock: BigInt(Math.min(cursor + Math.floor(chunkSize / 2), to)),
        });
        for (const l of logs) {
          const argsObj = l.args || {};
          const token = String(argsObj.token || "").toLowerCase();
          if (token && token.startsWith("0x")) tokens.push({ token, block: Number(l.blockNumber) });
        }
        cursor = Math.min(cursor + Math.floor(chunkSize / 2), to) + 1;
      } catch (e2) {
        console.error(`  !! retry failed at ${cursor}, skipping to ${cursor + 1000}`);
        cursor = cursor + 1000;
      }
    }
  }

  console.log(`  done: ${calls} calls, ${tokens.length} tokens`);
  return { platform: p.id, tokens, cursor: to };
}

async function main() {
  console.log(`Robinhood Chain launchpad backfill`);
  console.log(`RPC: ${RPC}`);
  console.log(`Chunk: ${chunkSize} | Dry-run: ${dryRun}`);

  const targets = PLATFORMS.filter((p) => !platformFilter || p.id === platformFilter);
  const results = [];
  const allTokens = new Map();

  for (const p of targets) {
    const r = await scanPlatform(p);
    results.push(r);
    for (const t of r.tokens) {
      if (!allTokens.has(t.token)) allTokens.set(t.token, t);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  for (const r of results) {
    console.log(`  ${r.platform}: ${r.tokens.length} tokens, cursor → ${r.cursor}`);
  }
  console.log(`  unique tokens: ${allTokens.size}`);

  if (dryRun || !redis) {
    console.log(dryRun ? "\n(dry-run — nothing written)" : "\n(no Redis credentials — nothing written)");
    return;
  }

  console.log("\nWriting to Upstash Redis…");
  for (const r of results) {
    await redis.set(`${PREFIX}${r.platform}`, r.cursor, { ex: 60 * 60 * 24 * 30 });
    console.log(`  cursor ${r.platform} → ${r.cursor}`);
  }
  const index = [...allTokens.values()].map((t) => ({
    id: t.token,
    platform: t.platform || "unknown",
    tokenAddress: t.token,
    block: t.block,
  }));
  await redis.set(INDEX_KEY, index, { ex: 60 * 60 * 6 });
  console.log(`  index stored: ${index.length} tokens (TTL 6h — cron will refresh)`);
  console.log("\nDone. Vercel cron will now keep the index fresh.");
}

// Minimal event parser (topic0 = keccak of signature) using viem's parser.
function parseEvent(sig) {
  return parseAbiItem(sig);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
