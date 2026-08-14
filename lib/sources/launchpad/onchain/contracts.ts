/**
 * On-chain launchpad contract registry (Phase 2).
 *
 * Each entry describes how to detect new token launches for a platform:
 * the factory/manager contract to watch, the launch event (ABI + topic0),
 * and how to derive the LaunchpadToken from the decoded event args.
 *
 * Verified addresses & event signatures come from the platform docs /
 * Blockscout (see implementation plan research, 2026-08-14).
 */

import type { AbiEvent } from "viem";
import { parseAbiItem } from "viem";
import type { LaunchpadSourceId, LaunchpadToken } from "../types";
import { launchpadInfo } from "../registry";

// ── Launch event ABIs (verified from Blockscout implementation ABI) ──

export const EVENT_ABIS: Record<string, AbiEvent> = {
  // Pons V1 factory
  // TokenLaunched(address indexed token, address indexed deployer,
  //   address indexed dexFactory, address pairToken, address pool, ...)
  TokenLaunchedPons: parseAbiItem(
    "event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)"
  ),
  // Pons V2 factory — verified ABI (PonsV2LaunchFactory)
  // TokenLaunched(address token indexed, address curve indexed, address deployer indexed,
  //   address pairToken, uint256 launchConfigId, uint256 graduationThreshold)
  TokenLaunchedV2: parseAbiItem(
    "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)"
  ),
  // Flap Portal — verified ABI (impl 0x7bc20c...)
  // TokenCreated(uint256 ts, address creator, uint256 nonce, address token,
  //   string name, string symbol, string meta)
  TokenCreatedFlap: parseAbiItem(
    "event TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)"
  ),
  // Trench TrenchManager — reverse-engineered from log data (3 indexed:
  // creator, curve, token; data: nonce, name, symbol, timestamp, tokenURI)
  TokenCreateTrench: parseAbiItem(
    "event TokenCreate(address indexed creator, address indexed curve, address indexed token, uint256 nonce, string name, string symbol, uint256 timestamp, string tokenURI)"
  ),
  // Bow FactoryHub
  // Launched(address indexed token, address indexed deployer, uint8 indexed version,
  //   uint8 slotId, address pool, bytes32 poolId, uint256 positionId, uint256 launchId)
  LaunchedBow: parseAbiItem(
    "event Launched(address indexed token, address indexed deployer, uint8 indexed version, uint8 slotId, address pool, bytes32 poolId, uint256 positionId, uint256 launchId)"
  ),
  // Bags BagsFactory — verified ABI (impl 0x7dfa0131...)
  // TokenCreated(address indexed token, address indexed curve, address indexed creator,
  //   address feeShare, address partner, bytes32 poolId, string name, string symbol, string metadataURI)
  TokenCreatedBags: parseAbiItem(
    "event TokenCreated(address indexed token, address indexed curve, address indexed creator, address feeShare, address partner, bytes32 poolId, string name, string symbol, string metadataURI)"
  ),
  // Pools.fun PartyFactory — verified ABI
  // TokenLaunched(address indexed token, address indexed pool, address pairedAsset,
  //   address indexed creator, address deployer, address feeRecipient, int24 startTick,
  //   string metadataUri, uint256 devBuyAmountOut)
  TokenLaunchedPoolsFun: parseAbiItem(
    "event TokenLaunched(address indexed token, address indexed pool, address pairedAsset, address indexed creator, address deployer, address feeRecipient, int24 startTick, string metadataUri, uint256 devBuyAmountOut)"
  ),
  // letscash CashCatFactoryVNext — verified ABI (impl 0x3dfd73a6...)
  // TokenLaunched(address indexed token, address indexed creator, bytes32 indexed poolId,
  //   uint256 configId, uint256 firstBuyIn, uint256 firstBuyOut, address hook, address feeRecipient)
  TokenLaunchedLetscash: parseAbiItem(
    "event TokenLaunched(address indexed token, address indexed creator, bytes32 indexed poolId, uint256 configId, uint256 firstBuyIn, uint256 firstBuyOut, address hook, address feeRecipient)"
  ),
  // Long.xyz LongLauncher — verified ABI
  // LaunchCreated(address indexed poolOrHook, address indexed asset, address indexed numeraire,
  //   address poolInitializer, address launcher, bytes32 tickerKey, uint48 deployedAt,
  //   uint48 reservedUntil, string normalizedTicker)
  LaunchCreatedLong: parseAbiItem(
    "event LaunchCreated(address indexed poolOrHook, address indexed asset, address indexed numeraire, address poolInitializer, address launcher, bytes32 tickerKey, uint48 deployedAt, uint48 reservedUntil, string normalizedTicker)"
  ),
  // Virtuals BondingV5 — verified ABI (impl 0x66fc520c...). The event
  // includes a tuple, which parseAbiItem can't express, so we define the
  // ABI as a JSON object instead.
  LaunchedVirtuals: {
    type: "event",
    name: "Launched",
    inputs: [
      { type: "address", name: "token", indexed: true },
      { type: "address", name: "pair", indexed: true },
      { type: "uint256", name: "virtualId", indexed: false },
      { type: "uint256", name: "initialPurchase", indexed: false },
      { type: "uint256", name: "initialPurchasedAmount", indexed: false },
      {
        type: "tuple",
        name: "launchParams",
        components: [
          { type: "uint8", name: "" },
          { type: "uint16", name: "" },
          { type: "bool", name: "" },
          { type: "uint8", name: "" },
          { type: "bool", name: "" },
        ],
        indexed: false,
      },
    ],
  } as unknown as AbiEvent,
  // Sushi SushiLaunchpad — verified ABI
  // TokenLaunched(address indexed creator, address indexed token, address indexed pool,
  //   address quoteToken, int24 startTick, string name, string symbol, uint16 reserveBps,
  //   uint256 reserveAmount, uint64 reserveUnlockAt, uint16 initialSushiFeeBps)
  TokenLaunchedSushi: parseAbiItem(
    "event TokenLaunched(address indexed creator, address indexed token, address indexed pool, address quoteToken, int24 startTick, string name, string symbol, uint16 reserveBps, uint256 reserveAmount, uint64 reserveUnlockAt, uint16 initialSushiFeeBps)"
  ),
};

// ── Topic0 hashes (reference only — viem derives them from the ABI) ──

// Pons V1: 0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a
// Pons V2: 0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607
// Bow:     0x65f174315961cf8b1c0d0763569c6c8746f20dc81df9151164bec284e6ed9f01
// Flap / Trench / Bags topic0s are derived from their ABIs at runtime.

// ── Platform contract definitions ──────────────────────────────

export interface OnchainPlatformConfig {
  id: LaunchpadSourceId;
  /** Factory / manager contract to watch for launch events. */
  factory: `0x${string}`;
  /** Launch event ABI. */
  event: AbiEvent;
  /** First block to scan from (deploy block or safe lower bound). */
  deployBlock: number;
  /** Derive a LaunchpadToken from decoded event args + block number. */
  toToken: (args: Record<string, unknown>, blockNumber: number) => LaunchpadToken | null;
  /**
   * Whether the cron/backfill actually scans this platform.
   * Disabled platforms stay in the registry (UI/labels) but are skipped
   * by the indexer.
   */
  scanEnabled?: boolean;
}

/** Shared "first deploy block" lower bound for Robinhood launchpads. */
export const RH_LAUNCHPAD_DEPLOY_LOWER_BOUND = 7_500_000;

function baseToken(
  id: LaunchpadSourceId,
  tokenAddress: string,
  name: string | null,
  symbol: string | null,
  pairAddress: string | null,
  launchBlock: number
): LaunchpadToken {
  const platform = launchpadInfo(id);
  const token = tokenAddress.toLowerCase();
  return {
    id: `${id}:${token}`,
    platform: id,
    platformName: platform?.name ?? id,
    tokenAddress: token,
    pairAddress: pairAddress ? pairAddress.toLowerCase() : null,
    name: name?.trim() || symbol?.trim() || "Unknown",
    symbol: symbol?.trim() || "???",
    phase: "graduated",
    priceUsd: null,
    fdvUsd: null,
    marketCapUsd: null,
    liquidityUsd: null,
    volume24hUsd: null,
    launchTimeMs: null,
    ageMs: null,
    launchBlock: launchBlock > 0 ? launchBlock : null,
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
}

/** Extract a 0x address from an event arg (string | { address } | null). */
function argAddress(v: unknown): string | null {
  if (typeof v === "string" && v.startsWith("0x")) return v.toLowerCase();
  if (v && typeof v === "object" && "address" in v && typeof (v as { address: unknown }).address === "string") {
    return ((v as { address: string }).address).toLowerCase();
  }
  return null;
}

function argString(v: unknown): string | null {
  if (typeof v === "string") return v;
  return null;
}

// ── Per-platform token derivation ──────────────────────────────

function ponsV1Token(args: Record<string, unknown>, block: number): LaunchpadToken | null {
  const token = argAddress(args.token);
  if (!token) return null;
  return baseToken("pons", token, null, null, argAddress(args.pool), block);
}

function ponsV2Token(args: Record<string, unknown>, block: number): LaunchpadToken | null {
  const token = argAddress(args.token);
  if (!token) return null;
  // V2 is bonding-curve → v4. Phase is bonding until graduation; the
  // indexer only sees the launch event, so we mark it "bonding" and let
  // the aggregator/UI enrich later (graduation = separate event).
  const t = baseToken("ponsv2", token, null, null, null, block);
  t.phase = "bonding";
  return t;
}

function flapToken(args: Record<string, unknown>, block: number): LaunchpadToken | null {
  const token = argAddress(args.token);
  if (!token) return null;
  // Flap is a bonding curve; launched tokens trade on the curve first.
  const t = baseToken("flap", token, null, null, null, block);
  t.phase = "bonding";
  return t;
}

function trenchToken(args: Record<string, unknown>, block: number): LaunchpadToken | null {
  const token = argAddress(args.token);
  if (!token) return null;
  const name = argString(args.name);
  const symbol = argString(args.symbol);
  const t = baseToken("trench", token, name, symbol, null, block);
  t.phase = "bonding";
  return t;
}

function bowToken(args: Record<string, unknown>, block: number): LaunchpadToken | null {
  const token = argAddress(args.token);
  if (!token) return null;
  // Bow tokens trade in a real V3/V4 pool from block one → graduated.
  return baseToken("bow", token, null, null, argAddress(args.pool), block);
}

function bagsToken(args: Record<string, unknown>, block: number): LaunchpadToken | null {
  const token = argAddress(args.token);
  if (!token) return null;
  // Bags is bonding-curve → v4 graduation; starts on the curve.
  const t = baseToken("bags", token, null, null, null, block);
  t.phase = "bonding";
  return t;
}

function poolsfunToken(args: Record<string, unknown>, block: number): LaunchpadToken | null {
  const token = argAddress(args.token);
  if (!token) return null;
  // Pools.fun: full supply launches straight into a Sushi V3 pool.
  return baseToken("poolsfun", token, null, null, argAddress(args.pool), block);
}

function letscashToken(args: Record<string, unknown>, block: number): LaunchpadToken | null {
  const token = argAddress(args.token);
  if (!token) return null;
  // letscash: full supply seeds a v4 pool at launch → graduated.
  const t = baseToken("letscash", token, null, null, null, block);
  t.phase = "graduated";
  return t;
}

function longToken(args: Record<string, unknown>, block: number): LaunchpadToken | null {
  const token = argAddress(args.asset);
  if (!token) return null;
  // Long.xyz: time-epoch v4 launch; token trades from launch.
  return baseToken("long", token, null, null, argAddress(args.poolOrHook), block);
}

function virtualsToken(args: Record<string, unknown>, block: number): LaunchpadToken | null {
  const token = argAddress(args.token);
  if (!token) return null;
  // Virtuals: bonding curve → v2 graduation; starts on the curve.
  const t = baseToken("virtuals", token, null, null, argAddress(args.pair), block);
  t.phase = "bonding";
  return t;
}

function sushiToken(args: Record<string, unknown>, block: number): LaunchpadToken | null {
  const token = argAddress(args.token);
  if (!token) return null;
  const name = argString(args.name);
  const symbol = argString(args.symbol);
  // Sushi Launchpad: locked Sushi V3 pool from block one → graduated.
  const t = baseToken("sushi", token, name, symbol, argAddress(args.pool), block);
  t.phase = "graduated";
  return t;
}

// ── Registry ───────────────────────────────────────────────────

export const ONCHAIN_PLATFORMS: OnchainPlatformConfig[] = [
  {
    id: "pons",
    factory: "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB",
    event: EVENT_ABIS.TokenLaunchedPons,
    deployBlock: 8_991_118,
    toToken: ponsV1Token,
    scanEnabled: true,
  },
  {
    id: "ponsv2",
    factory: "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e",
    event: EVENT_ABIS.TokenLaunchedV2,
    deployBlock: RH_LAUNCHPAD_DEPLOY_LOWER_BOUND,
    toToken: ponsV2Token,
    scanEnabled: true,
  },
  {
    id: "flap",
    factory: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09",
    event: EVENT_ABIS.TokenCreatedFlap,
    deployBlock: RH_LAUNCHPAD_DEPLOY_LOWER_BOUND,
    toToken: flapToken,
    scanEnabled: true,
  },
  {
    id: "trench",
    factory: "0x77dC6f6361b7b99456FC3761ce5b7ddA80d83f9d",
    event: EVENT_ABIS.TokenCreateTrench,
    deployBlock: RH_LAUNCHPAD_DEPLOY_LOWER_BOUND,
    toToken: trenchToken,
    // Temporarily disabled: the exact event signature is not yet
    // confirmed (observed topic0 0xe2eb7016... didn't match candidates).
    // Reverse-engineering in progress — re-enable once verified.
    scanEnabled: false,
  },
  {
    id: "bow",
    factory: "0x229Faa919ABf14279E2461Dba53F039c5B4C7E29",
    event: EVENT_ABIS.LaunchedBow,
    deployBlock: RH_LAUNCHPAD_DEPLOY_LOWER_BOUND,
    toToken: bowToken,
    scanEnabled: true,
  },
  {
    id: "bags",
    factory: "0xe8Cc4431adF8b5A847C113EF0c6af9043219Cb37",
    event: EVENT_ABIS.TokenCreatedBags,
    deployBlock: 7_887_312,
    toToken: bagsToken,
    // Disabled per user request — Bags is skipped.
    scanEnabled: false,
  },
  {
    id: "poolsfun",
    factory: "0x626C3d09B65bF5d1D40E0D5F25e19fa49783B3D4",
    event: EVENT_ABIS.TokenLaunchedPoolsFun,
    deployBlock: RH_LAUNCHPAD_DEPLOY_LOWER_BOUND,
    toToken: poolsfunToken,
    scanEnabled: true,
  },
  {
    id: "letscash",
    factory: "0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661",
    event: EVENT_ABIS.TokenLaunchedLetscash,
    deployBlock: RH_LAUNCHPAD_DEPLOY_LOWER_BOUND,
    toToken: letscashToken,
    scanEnabled: true,
  },
  {
    id: "long",
    factory: "0x22e99278308B393ea1260859B181AD7E78f5eeED",
    event: EVENT_ABIS.LaunchCreatedLong,
    deployBlock: RH_LAUNCHPAD_DEPLOY_LOWER_BOUND,
    toToken: longToken,
    scanEnabled: true,
  },
  {
    id: "virtuals",
    factory: "0xd4cCBFA37e2f35611b3042e4096Ad7a3459Bd007",
    event: EVENT_ABIS.LaunchedVirtuals,
    deployBlock: RH_LAUNCHPAD_DEPLOY_LOWER_BOUND,
    toToken: virtualsToken,
    scanEnabled: true,
  },
  {
    id: "sushi",
    factory: "0x104f1ab42674565ec3df0bfebccc4186f72fa7ed",
    event: EVENT_ABIS.TokenLaunchedSushi,
    deployBlock: RH_LAUNCHPAD_DEPLOY_LOWER_BOUND,
    toToken: sushiToken,
    scanEnabled: true,
  },
];

/** Platforms the indexer actually scans (scanEnabled !== false). */
export function enabledOnchainPlatforms(): OnchainPlatformConfig[] {
  return ONCHAIN_PLATFORMS.filter((p) => p.scanEnabled !== false);
}

export function onchainPlatform(id: LaunchpadSourceId): OnchainPlatformConfig | undefined {
  return ONCHAIN_PLATFORMS.find((p) => p.id === id);
}
