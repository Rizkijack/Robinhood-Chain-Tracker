/**
 * Connection manager — orchestrates the 3-tier hybrid defense system.
 *
 * Responsibilities:
 *   1. Try Tier 1 (WebSocket) first. If it fails within 3s, fall back
 *      silently to Tier 3 (polling) — the existing system keeps running.
 *   2. Translate raw WebSocket client events into a clean snapshot
 *      that React hooks can subscribe to.
 *   3. Track the latest block number from `newHeads` events so the UI
 *      can show "Block #N" in real-time when WS is active.
 *
 * Why a separate manager (not inside the React hook)?
 *   - The connection lifecycle spans multiple component mounts/unmounts.
 *   - We want exactly one WS connection per app instance, not per hook.
 *   - The manager is a singleton; the hook is a thin React wrapper.
 *
 * Browser-only. Importing on the server is safe (the WS client guards
 * `typeof WebSocket`), but `start()` will resolve to polling mode.
 */

import { BlockchainWebSocketClient } from "./websocket-client";
import {
  INITIAL_SNAPSHOT,
  type ConnectionMethod,
  type ConnectionSnapshot,
  type FallbackReason,
  type SubscriptionType,
} from "./types";

/* ── Singleton ───────────────────────────────────────────────── */

class ConnectionManager {
  private client: BlockchainWebSocketClient | null = null;
  private snapshot: ConnectionSnapshot = { ...INITIAL_SNAPSHOT };
  private listeners = new Set<(s: ConnectionSnapshot) => void>();
  private started = false;

  /** The subscriptions to auto-start once WS connects. */
  private readonly defaultSubs: SubscriptionType[] = ["newHeads"];

  /**
   * Boot the streaming system. Idempotent: calling twice is a no-op.
   *
   * Flow:
   *   1. If NEXT_PUBLIC_WSS_URL is unset/empty → polling immediately.
   *   2. Try WS connect with 3s timeout.
   *   3. On success → subscribe to defaultSubs, method = "websocket".
   *   4. On failure → method = "polling" (silent, no UI interruption).
   */
  start(url: string | undefined): void {
    if (this.started) return;
    this.started = true;
    this.snapshot = {
      ...this.snapshot,
      status: "connecting",
      method: "polling", // assume polling until WS proves itself
    };
    this.emit();

    // No WSS URL configured → skip Tier 1 entirely.
    const wssUrl = url?.trim();
    if (!wssUrl) {
      this.snapshot = {
        ...this.snapshot,
        status: "connected",
        method: "polling",
        reason: "ws-unavailable",
      };
      this.emit();
      return;
    }

    this.client = new BlockchainWebSocketClient();

    // ── Wire up client events ──────────────────────────────────
    this.client.on("open", ({ latencyMs }) => {
      this.snapshot = {
        ...this.snapshot,
        status: "connected",
        method: "websocket",
        reason: "",
        reconnectAttempts: 0,
        latencyMs,
      };
      this.emit();

      // Start the default subscriptions once the socket is open.
      for (const type of this.defaultSubs) {
        this.client?.subscribe(type);
      }
    });

    this.client.on("subscribed", ({ type }) => {
      // Could be used for diagnostics; nothing to update in the snapshot.
      void type;
    });

    this.client.on("event", ({ data }) => {
      // Extract block number from newHeads events.
      if (data && typeof data === "object" && "number" in data) {
        const blockNum = (data as { number?: string }).number;
        if (typeof blockNum === "string") {
          this.snapshot = {
            ...this.snapshot,
            latestBlock: blockNum,
            lastEventAt: Date.now(),
          };
          this.emit();
        }
      } else {
        // Non-newHeads event — just bump the activity timestamp.
        this.snapshot = {
          ...this.snapshot,
          lastEventAt: Date.now(),
        };
        this.emit();
      }
    });

    this.client.on("close", () => {
      // WS dropped. Don't switch to "polling" immediately — the
      // existing polling layer keeps running independently. Just
      // flag that we're in a degraded state so the UI can reflect it.
      if (this.snapshot.method === "websocket") {
        this.snapshot = {
          ...this.snapshot,
          status: "reconnecting",
          // method stays "websocket" until reconnect fails for good,
          // so the UI shows "reconnecting" rather than flickering.
        };
        this.emit();
      }
    });

    this.client.on("fallback", ({ reason }) => {
      // Reconnect attempts exhausted — permanent fallback to polling.
      this.snapshot = {
        ...this.snapshot,
        status: "connected",
        method: "polling",
        reason: reason || "ws-closed",
        reconnectAttempts: 0,
      };
      this.emit();
    });

    // Kick off the initial connection attempt (3s timeout).
    void this.client.connect(wssUrl).then((result) => {
      if (!result.ok) {
        // WS failed to connect within 3s — silent fallback to polling.
        this.snapshot = {
          ...this.snapshot,
          status: "connected",
          method: "polling",
          reason: result.reason || "ws-error",
          latencyMs: null,
        };
        this.emit();
      }
      // If result.ok, the "open" event handler above already updated
      // the snapshot to "websocket".
    });
  }

  /** Shut down the WS connection. Polling is unaffected. */
  stop(): void {
    this.client?.disconnect();
    this.client = null;
    this.started = false;
    this.snapshot = { ...INITIAL_SNAPSHOT };
    this.emit();
  }

  /** Get a read-only copy of the current state. */
  getSnapshot(): ConnectionSnapshot {
    return { ...this.snapshot };
  }

  /** Subscribe to snapshot changes. Returns an unsubscribe function. */
  subscribe(listener: (s: ConnectionSnapshot) => void): () => void {
    this.listeners.add(listener);
    // Immediately emit current state to new subscribers.
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Force a manual reconnect attempt (e.g. user clicked "retry"). */
  retry(url: string | undefined): void {
    const wssUrl = url?.trim();
    if (!wssUrl) return;
    this.client?.disconnect();
    this.snapshot = {
      ...this.snapshot,
      status: "connecting",
      method: "polling",
      reason: "manual",
    };
    this.emit();
    if (!this.client) this.client = new BlockchainWebSocketClient();
    void this.client.connect(wssUrl);
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const l of [...this.listeners]) {
      try {
        l(snap);
      } catch {
        // Listener errors must not break the manager.
      }
    }
  }
}

/* ── Module-level singleton ────────────────────────────────────
 * One connection per browser tab. The hook (useBlockchainStream)
 * is the public surface; components never touch this directly.
 * ──────────────────────────────────────────────────────────── */
let instance: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
  if (!instance) instance = new ConnectionManager();
  return instance;
}

/** Reset the singleton — test helper only. */
export function _resetConnectionManager(): void {
  instance?.stop();
  instance = null;
}

// Re-export types that callers commonly need alongside the manager.
export type { ConnectionMethod, ConnectionSnapshot, FallbackReason };
