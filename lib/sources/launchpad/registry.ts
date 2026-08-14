import type { LaunchpadSourceId } from "./types";

/**
 * Launchpad platform registry — single source of truth for the
 * platforms the backend knows about, their public URLs, and whether
 * they need an API key.
 *
 * Phase 1 entries are wired to live adapters. Phase 2 entries are
 * reserved for the on-chain indexer (no adapter yet — they are not
 * included in the aggregated feed until implemented).
 */
export interface LaunchpadPlatformInfo {
  id: LaunchpadSourceId;
  /** Display name used in UI badges / feed sources. */
  name: string;
  /** Human-facing product URL. */
  url: string;
  /** True when a Phase-1 adapter exists for this platform. */
  implemented: boolean;
  requiresApiKey?: boolean;
  apiKeyEnv?: string;
}

export const LAUNCHPAD_SOURCES: LaunchpadPlatformInfo[] = [
  { id: "lemon", name: "Lemon", url: "https://lemon.fun", implemented: true },
  { id: "bankr", name: "Bankr", url: "https://bankr.bot", implemented: true },
  { id: "poolstrade", name: "Pools.trade", url: "https://pools.trade", implemented: true },
  { id: "sushi", name: "Sushi", url: "https://sushi.com", implemented: true },
  {
    id: "o1exchange",
    name: "01.exchange",
    url: "https://launch.o1.exchange",
    implemented: true,
    requiresApiKey: true,
    apiKeyEnv: "O1_EXCHANGE_API_KEY",
  },
  // ── Phase 2 (on-chain indexer, implemented) ─────────────────
  { id: "pons", name: "Pons", url: "https://ponsfamily.com", implemented: true },
  { id: "ponsv2", name: "Pons V2", url: "https://ponsfamily.com", implemented: true },
  { id: "flap", name: "Flap", url: "https://flap.sh", implemented: true },
  { id: "trench", name: "Trench", url: "https://trench.today", implemented: true },
  { id: "bow", name: "Bow", url: "https://bow.fun", implemented: true },
  { id: "bags", name: "Bags", url: "https://bags.fm", implemented: true },
  // ── Phase 2b (reserved, not yet implemented) ─────────────────
  { id: "poolsfun", name: "Pools.fun", url: "https://pools.fun", implemented: false },
  { id: "letscash", name: "letscash", url: "https://letscash.fun", implemented: false },
  { id: "long", name: "Long", url: "https://long.xyz", implemented: false },
  { id: "varo", name: "Varo", url: "https://varo.rialto.xyz", implemented: false },
  { id: "virtuals", name: "Virtuals", url: "https://virtuals.io", implemented: false },
  { id: "noxa", name: "Noxa", url: "https://noxa.fi", implemented: false },
];

/** Lookup helper — returns the platform info or undefined. */
export function launchpadInfo(id: LaunchpadSourceId): LaunchpadPlatformInfo | undefined {
  return LAUNCHPAD_SOURCES.find((p) => p.id === id);
}

/** Platforms that have a working adapter (Phase 1). */
export function implementedLaunchpads(): LaunchpadPlatformInfo[] {
  return LAUNCHPAD_SOURCES.filter((p) => p.implemented);
}
