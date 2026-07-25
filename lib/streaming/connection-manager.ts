/**
 * Connection manager — orchestrates the 3-tier hybrid defense system.
 *
 * Responsibilities:
 *   1. Try Tier 1 (WebSocket or SSE) first. If it fails within 3s, fall back
 *      silently to Tier 3 (polling) — the existing system keeps running.
 *   2. Translate raw client events into a clean snapshot
 *      that React hooks can subscribe to.
 *   3. Track the latest block number from `newHeads` events so the UI
 *      can show "Block #N" in real-time when streaming is active.
 *
 * Why a separate manager (not inside the React hook)?
 *   - The connection lifecycle spans multiple component mounts/unmounts.
 *   - We want exactly one connection per app instance, not per hook.
 *   - The manager is a singleton; the hook is a thin React wrapper.
 *
 * Browser-only. Importing on the server is safe (the clients guard
 * `typeof WebSocket` and `typeof EventSource`), but `start()` will resolve to polling mode.
 */

import { WebSocketClient as BlockchainWebSocketClient } from "./websocket-client";
import { SSEClient } from "./sse-client";
import {
  INITIAL_SNAPSHOT,
  type ConnectionMethod,
  type ConnectionSnapshot,
  type FallbackReason,
  type SubscriptionType,
  type BlockchainNodeConfig,
} from "./types";

/** Blockchain node configuration presets. */
export const BLOCKCHAIN_NODES: Record<string, BlockchainNodeConfig> = {
  ethereum: {
    name: "Ethereum Mainnet",
    wsUrl: process.env.NEXT_PUBLIC_ETH_WSS_URL,
    sseUrl: process.env.NEXT_PUBLIC_ETH_SSE_URL,
    httpUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL,
    chainId: 1,
    supportsSubscriptions: true,
  },
  polygon: {
    name: "Polygon",
    wsUrl: process.env.NEXT_PUBLIC_POLYGON_WSS_URL,
    sseUrl: process.env.NEXT_PUBLIC_POLYGON_SSE_URL,
    httpUrl: process.env.NEXT_PUBLIC_POLYGON_RPC_URL,
    chainId: 137,
    supportsSubscriptions: true,
  },
  bsc: {
    name: "BNB Smart Chain",
    wsUrl: process.env.NEXT_PUBLIC_BSC_WSS_URL,
    sseUrl: process.env.NEXT_PUBLIC_BSC_SSE_URL,
    httpUrl: process.env.NEXT_PUBLIC_BSC_RPC_URL,
    chainId: 56,
    supportsSubscriptions: true,
  },
};

type StreamingClient = BlockchainWebSocketClient | SSEClient | null;

class ConnectionManager {
  private client: StreamingClient = null;
  private snapshot: ConnectionSnapshot = { ...INITIAL_SNAPSHOT };
  private listeners = new Set<(s: ConnectionSnapshot) => void>();
  private started = false;
  private connectionMethod: "websocket" | "sse" | null = null;

  /** The subscriptions to auto-start once connection is established. */
  private readonly defaultSubs: SubscriptionType[] = ["newHeads"];

  /**
   * Boot the streaming system. Idempotent: calling twice is a no-op.
   */
  start(wsUrl?: string, sseUrl?: string): void {
    if (this.started) return;
    this.started = true;
    this.snapshot = {
      ...this.snapshot,
      status: "connecting",
      method: "polling",
    };
    this.emit();

    const trimmedWsUrl = wsUrl?.trim();
    const trimmedSseUrl = sseUrl?.trim();

    if (!trimmedWsUrl && !trimmedSseUrl) {
      this.snapshot = {
        ...this.snapshot,
        status: "connected",
        method: "polling",
        reason: "streaming-unavailable",
      };
      this.emit();
      return;
    }

    if (trimmedWsUrl) {
      this.connectWithWebSocket(trimmedWsUrl);
    } else if (trimmedSseUrl) {
      this.connectWithSSE(trimmedSseUrl);
    }
  }

  private connectWithWebSocket(wsUrl: string): void {
    this.connectionMethod = "websocket";
    this.client = new BlockchainWebSocketClient({ url: wsUrl });

    this.client.on("open", () => {
      this.snapshot = {
        ...this.snapshot,
        status: "connected",
        method: "websocket",
        reason: "",
        reconnectAttempts: 0,
        latencyMs: 0,
      };
      this.emit();

      for (const type of this.defaultSubs) {
        this.client?.subscribe(type);
      }
    });

    this.client.on("message", (data) => {
      if ("params" in data && data.method === "eth_subscription") {
        this.handleEventData((data as any).params.result);
      }
    });

    this.client.on("close", () => {
      this.handleConnectionClose();
    });

    this.client.on("error", (error) => {
      console.error("WebSocket error:", error);
    });

    void this.client.connect();
  }

  private connectWithSSE(sseUrl: string): void {
    this.connectionMethod = "sse";
    this.client = new SSEClient({ url: sseUrl });

    this.client.on("open", () => {
      this.snapshot = {
        ...this.snapshot,
        status: "connected",
        method: "sse",
        reason: "",
        reconnectAttempts: 0,
        latencyMs: 0,
      };
      this.emit();

      for (const type of this.defaultSubs) {
        this.client?.subscribe(type);
      }
    });

    this.client.on("message", (data) => {
      if ("params" in data && data.method === "eth_subscription") {
        this.handleEventData((data as any).params.result);
      }
    });

    this.client.on("close", () => {
      this.handleConnectionClose();
    });

    this.client.on("error", (error) => {
      console.error("SSE error:", error);
    });

    void this.client.connect();
  }

  private handleEventData(data: unknown): void {
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
      this.snapshot = {
        ...this.snapshot,
        lastEventAt: Date.now(),
      };
      this.emit();
    }
  }

  private handleConnectionClose(): void {
    const currentMethod = this.snapshot.method;
    if (currentMethod === "websocket" || currentMethod === "sse") {
      this.snapshot = {
        ...this.snapshot,
        status: "reconnecting",
      };
      this.emit();
    }
  }

  stop(): void {
    if (this.client) {
      if ("disconnect" in this.client) {
        this.client.disconnect();
      }
    }
    this.client = null;
    this.started = false;
    this.connectionMethod = null;
    this.snapshot = { ...INITIAL_SNAPSHOT };
    this.emit();
  }

  getSnapshot(): ConnectionSnapshot {
    return { ...this.snapshot };
  }

  subscribe(listener: (s: ConnectionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  retry(wsUrl?: string, sseUrl?: string): void {
    const trimmedWsUrl = wsUrl?.trim();
    const trimmedSseUrl = sseUrl?.trim();

    if (!trimmedWsUrl && !trimmedSseUrl) return;

    if (this.client && "disconnect" in this.client) {
      this.client.disconnect();
    }

    this.snapshot = {
      ...this.snapshot,
      status: "connecting",
      method: "polling",
      reason: "manual",
    };
    this.emit();

    if (trimmedWsUrl) {
      this.connectWithWebSocket(trimmedWsUrl);
    } else if (trimmedSseUrl) {
      this.connectWithSSE(trimmedSseUrl);
    }
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

let instance: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
  if (!instance) instance = new ConnectionManager();
  return instance;
}

export function _resetConnectionManager(): void {
  instance?.stop();
  instance = null;
}

export type { ConnectionMethod, ConnectionSnapshot, FallbackReason, BlockchainNodeConfig };
