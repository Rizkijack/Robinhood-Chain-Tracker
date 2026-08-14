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
    enabled: true,
  },
  {
    id: "ponsv2",
    factory: "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e",
    event: "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
    deployBlock: 7500000,
    enabled: true,
  },
  {
    id: "flap",
    factory: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09",
    event: "event TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)",
    deployBlock: 7500000,
    enabled: true,
  },
  {
    id: "trench",
    factory: "0x77dC6f6361b7b99456FC3761ce5b7ddA80d83f9d",
    event: "event TokenCreate(address indexed creator, address curve, address token, address quote, string name, string symbol, uint256 timestamp, string tokenURI)",
    deployBlock: 7500000,
    enabled: false, // signature not yet confirmed — see contracts.ts
  },
  {
    id: "bow",
    factory: "0x229Faa919ABf14279E2461Dba53F039c5B4C7E29",
    event: "event Launched(address indexed token, address indexed deployer, uint8 indexed version, uint8 slotId, address pool, bytes32 poolId, uint256 positionId, uint256 launchId)",
    deployBlock: 7500000,
    enabled: true,
  },
  {
    id: "bags",
    factory: "0xe8Cc4431adF8b5A847C113EF0c6af9043219Cb37",
    event: "event TokenCreated(address indexed token, address indexed curve, address indexed creator, address feeShare, address partner, bytes32 poolId, string name, string symbol, string metadataURI)",
    deployBlock: 7887312,
    enabled: false, // skipped per user request
  },
  {
    id: "poolsfun",
    factory: "0x626C3d09B65bF5d1D40E0D5F25e19fa49783B3D4",
    event: "event TokenLaunched(address indexed token, address indexed pool, address pairedAsset, address indexed creator, address deployer, address feeRecipient, int24 startTick, string metadataUri, uint256 devBuyAmountOut)",
    deployBlock: 7500000,
    enabled: true,
  },
  {
    id: "letscash",
    factory: "0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661",
    event: "event TokenLaunched(address indexed token, address indexed creator, bytes32 indexed poolId, uint256 configId, uint256 firstBuyIn, uint256 firstBuyOut, address hook, address feeRecipient)",
    deployBlock: 7500000,
    enabled: true,
  },
  {
    id: "long",
    factory: "0x22e99278308B393ea1260859B181AD7E78f5eeED",
    event: "event LaunchCreated(address indexed poolOrHook, address indexed asset, address indexed numeraire, address poolInitializer, address launcher, bytes32 tickerKey, uint48 deployedAt, uint48 reservedUntil, string normalizedTicker)",
    deployBlock: 7500000,
    enabled: true,
  },
  {
    id: "virtuals",
    factory: "0xd4cCBFA37e2f35611b3042e4096Ad7a3459Bd007",
    event: "event Launched(address indexed token, address indexed pair, uint256 virtualId, uint256 initialPurchase, uint256 initialPurchasedAmount, tuple(uint8,uint16,bool,uint8,bool) launchParams)",
    deployBlock: 7500000,
    enabled: true,
  },
  {
    id: "sushi",
    factory: "0x104f1ab42674565ec3df0bfebccc4186f72fa7ed",
    event: "event TokenLaunched(address indexed creator, address indexed token, address indexed pool, address quoteToken, int24 startTick, string name, string symbol, uint16 reserveBps, uint256 reserveAmount, uint64 reserveUnlockAt, uint16 initialSushiFeeBps)",
    deployBlock: 7500000,
    enabled: true,
  },
];

const args = process.argv.slice(2);
const arg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : undefined;
};
const platformFilter = arg("platform");
// Default 20k blocks/chunk: small enough that dense factories (Flap,
// Pons) don't trip the RPC's response-size limit, fast enough for a
// 7-day backfill (~300 calls/platform).
const chunkSize = Number(arg("chunk") || 20000);
const dryRun = args.includes("--dry-run");

// ~7 days of blocks at ~0.1s/block (measured). Start scan there, not at
// the deploy block — we only track recent launches.
const LOOKBACK_BLOCKS = 6_000_000;

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

// Flush stdout per line so progress is visible when redirected to a file.
const log = (msg) => {
  console.log(msg);
  try { process.stdout.write(""); } catch { /* ignore */ }
};

/** RPC call with a hard timeout (public RPC can hang). */
async function rpcCall(fn) {
  const timeoutMs = 30_000;
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("RPC timeout")), timeoutMs)
    ),
  ]);
}

async function scanPlatform(p) {
  const stored = redis ? await redis.get(`${PREFIX}${p.id}`) : null;
  const head = Number(await rpcCall(() => client.getBlockNumber()));
  // No cursor yet → start ~7 days back (not the deploy block).
  const lookbackStart = Math.max(p.deployBlock, head - LOOKBACK_BLOCKS);
  let from = Number(stored) || lookbackStart;
  let to = head;

  log(`\n=== ${p.id} ===`);
  log(`  factory:     ${p.factory}`);
  log(`  from:        ${from} (deploy ${p.deployBlock}, lookback start ${lookbackStart})`);
  log(`  to:          ${to} (head)`);
  log(`  blocks:      ${to - from} (${chunkSize}/chunk → ${Math.ceil((to - from) / chunkSize)} calls)`);

  let tokens = [];
  let cursor = from;
  let calls = 0;

  while (cursor < to) {
    const end = Math.min(cursor + chunkSize - 1, to);
    calls++;
    try {
      const logs = await rpcCall(() => client.getLogs({
        address: p.factory,
        event: parseEvent(p.event),
        fromBlock: BigInt(cursor),
        toBlock: BigInt(end),
      }));
      for (const l of logs) {
        const argsObj = l.args || {};
        const token = String(argsObj.token || "").toLowerCase();
        if (token && token.startsWith("0x")) {
          tokens.push({ token, block: Number(l.blockNumber) });
        }
      }
      if (calls % 25 === 0) {
        log(`  ...${calls} calls, ${tokens.length} tokens (block ${end})`);
      }
      cursor = end + 1;
      await sleep(300);
    } catch (e) {
      log(`  !! chunk ${cursor}-${end} failed: ${String(e).slice(0, 120)}`);
      await sleep(1500);
      // Retry once with smaller chunk
      try {
        const logs = await rpcCall(() => client.getLogs({
          address: p.factory,
          event: parseEvent(p.event),
          fromBlock: BigInt(cursor),
          toBlock: BigInt(Math.min(cursor + Math.floor(chunkSize / 2), to)),
        }));
        for (const l of logs) {
          const argsObj = l.args || {};
          const token = String(argsObj.token || "").toLowerCase();
          if (token && token.startsWith("0x")) tokens.push({ token, block: Number(l.blockNumber) });
        }
        cursor = Math.min(cursor + Math.floor(chunkSize / 2), to) + 1;
      } catch (e2) {
        log(`  !! retry failed at ${cursor}, skipping to ${cursor + 1000}`);
        cursor = cursor + 1000;
      }
    }
  }

  log(`  done: ${calls} calls, ${tokens.length} tokens`);
  return { platform: p.id, tokens, cursor: to };
}

async function main() {
  log(`Robinhood Chain launchpad backfill`);
  log(`RPC: ${RPC}`);
  log(`Chunk: ${chunkSize} | Dry-run: ${dryRun}`);

  const targets = PLATFORMS.filter(
    (p) => p.enabled !== false && (!platformFilter || p.id === platformFilter)
  );
  if (!targets.length) {
    log("No enabled platforms to scan (platform filter matches none).");
    return;
  }
  const results = [];
  const allTokens = new Map();
  let headBlockRef = 0;
  try {
    headBlockRef = Number(await rpcCall(() => client.getBlockNumber()));
  } catch { /* leave 0 — timestamps fall back to Date.now() */ }

  for (const p of targets) {
    const r = await scanPlatform(p);
    results.push(r);
    for (const t of r.tokens) {
      // Tag each token with its platform for the index write.
      const tagged = { ...t, platform: p.id };
      if (!allTokens.has(t.token)) allTokens.set(t.token, tagged);
    }
  }

  log(`\n=== SUMMARY ===`);
  for (const r of results) {
    log(`  ${r.platform}: ${r.tokens.length} tokens, cursor → ${r.cursor}`);
  }
  log(`  unique tokens: ${allTokens.size}`);

  if (dryRun || !redis) {
    log(dryRun ? "\n(dry-run — nothing written)" : "\n(no Redis credentials — nothing written)");
    return;
  }

  log("\nWriting to Upstash Redis…");
  for (const r of results) {
    await redis.set(`${PREFIX}${r.platform}`, r.cursor, { ex: 60 * 60 * 24 * 30 });
    log(`  cursor ${r.platform} → ${r.cursor}`);
  }
  // Resolve launch timestamps from block numbers. Block time is ~0.1s,
  // so estimate: launchTime ≈ headTime − (headBlock − launchBlock) × 100ms.
  // Good enough for sorting; the cron re-resolves precisely.
  let headTs = Date.now();
  try {
    const hb = await rpcCall(() => client.getBlock({ blockNumber: BigInt(headBlockRef) }));
    headTs = Number(hb.timestamp) * 1000;
  } catch { /* keep Date.now() */ }

  // Write a full LaunchpadToken-shaped index so getOnchainTokens() can
  // read it directly. Fields that need on-chain lookups (name, symbol,
  // price, mcap) are filled later by refreshOnchainIndex (cron).
  const index = [...allTokens.entries()].map(([addr, t]) => {
    const launchTimeMs =
      t.block != null ? headTs - (headBlockRef - t.block) * 100 : null;
    return {
      id: `${t.platform}:${addr}`,
      platform: t.platform,
      platformName: t.platform,
      tokenAddress: addr,
      pairAddress: null,
      name: "Unknown",
      symbol: "???",
      phase: "graduated",
      priceUsd: null,
      fdvUsd: null,
      marketCapUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      launchTimeMs,
      ageMs: launchTimeMs != null ? Date.now() - launchTimeMs : null,
      launchBlock: t.block,
      imageUrl: null,
      description: null,
      socials: [],
      graduationProgressPct: null,
      thresholdQuote: null,
      devBuyUsd: null,
      holders: null,
      feeSplit: null,
      taxRateBps: null,
      lockedLiquidity: true,
      quoteSymbol: null,
    };
  });
  await redis.set(INDEX_KEY, index, { ex: 60 * 60 * 6 });
  log(`  index stored: ${index.length} tokens (TTL 6h — cron will refresh & filter)`);
  log("\nDone. Vercel cron will now keep the index fresh.");
}

// Minimal event parser (topic0 = keccak of signature) using viem's parser.
function parseEvent(sig) {
  return parseAbiItem(sig);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
