"use client";

/**
 * Public React hook for the hybrid blockchain streaming system.
 *
 * Boots the connection-manager singleton on mount, subscribes to
 * snapshot changes, and returns everything a component needs to
 * show connection status + (optionally) react to live blockchain
 * events.
 *
 * Usage:
 *   const { method, isConnected, latestBlock } = useBlockchainStream();
 *
 * The hook is safe to call from multiple components — the underlying
 * connection-manager is a singleton, so only one WS connection exists
 * per browser tab.
 *
 * Polling (Tier 3) is NOT managed here. The existing feed-store
 * polling in TrackerApp.tsx continues to run independently. When WS
 * is active, both layers run in parallel — WS for instant block
 * updates, polling for the full pair list / metadata.
 */

import { useEffect, useState } from "react";
import { getConnectionManager } from "@/lib/streaming/connection-manager";
import type { ConnectionSnapshot } from "@/lib/streaming/types";

export interface BlockchainStreamState {
  /** Current transport: "websocket" (Tier 1) or "polling" (Tier 3). */
  method: ConnectionSnapshot["method"];
  /** True when status === "connected" (regardless of method). */
  isConnected: boolean;
  /** Full snapshot for advanced consumers. */
  snapshot: ConnectionSnapshot;
  /** Latest block number as a hex string (e.g. "0x1a2b3c"), or null. */
  latestBlock: string | null;
  /** True while the initial WS handshake is in progress (≤ 3s). */
  isConnecting: boolean;
}

export function useBlockchainStream(): BlockchainStreamState {
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>(
    () => getConnectionManager().getSnapshot()
  );

  useEffect(() => {
    const manager = getConnectionManager();
    // Start the manager if it hasn't been started yet. Idempotent.
    const wssUrl = process.env.NEXT_PUBLIC_WSS_URL;
    manager.start(wssUrl);

    const unsubscribe = manager.subscribe((s) => {
      setSnapshot(s);
    });

    return () => {
      unsubscribe();
      // NOTE: We intentionally do NOT call manager.stop() here.
      // The manager is a singleton — the connection should outlive
      // individual component mounts (e.g. during tab switches or
      // React StrictMode double-invoke in dev).
    };
  }, []);

  return {
    method: snapshot.method,
    isConnected: snapshot.status === "connected",
    snapshot,
    latestBlock: snapshot.latestBlock,
    isConnecting: snapshot.status === "connecting",
  };
}
