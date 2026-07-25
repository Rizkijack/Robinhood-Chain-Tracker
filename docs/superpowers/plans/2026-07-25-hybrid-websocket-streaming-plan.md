# Hybrid WebSocket Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hybrid WebSocket streaming system that connects directly to Robinhood Chain via Alchemy WSS for sub-second real-time updates, with automatic silent fallback to HTTP polling when WebSocket fails.

**Architecture:** 3-tier defense system — Tier 1: WebSocket via Alchemy WSS (3s timeout, auto-reconnect); Tier 3: HTTP polling fallback (existing lib/background-refresh.ts). Tier 2 (SSE) intentionally skipped for MVP. A connection-manager orchestrates the fallback, exposed via a React hook to a ConnectionStatus UI component.

**Tech Stack:** Next.js 14, TypeScript, Zustand, viem, wagmi, vitest, WebSocket API (browser-native)

## Global Constraints

- TypeScript strict mode enabled (tsconfig.json)
- Next.js 14 App Router (no pages directory)
- All streaming code is client-safe (no server-only imports)
- WebSocket URL comes from NEXT_PUBLIC_WSS_URL env var
- 3-second timeout for WebSocket connection attempt
- Max 3 reconnect attempts with exponential backoff (1s, 2s, 4s)
- Silent fallback — no UI interruption when falling back to polling
- No new heavy dependencies (use native WebSocket, no `ws` package in client code)
- Vitest for unit tests (existing test infrastructure)
- Commit frequency: one commit per task

---

## File Structure

### Files to Create:
1. `lib/streaming/types.ts` — TypeScript types for streaming system
2. `lib/streaming/websocket-client.ts` — Pure WebSocket client with timeout, reconnect, subscription helpers
3. `lib/streaming/connection-manager.ts` — Orchestrator for 3-tier fallback logic
4. `lib/streaming/__tests__/websocket-client.test.ts` — Unit tests for WebSocket client
5. `hooks/useBlockchainStream.ts` — React hook (public API for components)
6. `hooks/useConnectionStatus.ts` — React hook for connection status
7. `components/ConnectionStatus.tsx` — UI indicator component

### Files to Modify:
1. `.env.example` — Add NEXT_PUBLIC_WSS_URL
2. `components/TrackerApp.tsx` — Integrate ConnectionStatus component

---

## Task 1: TypeScript Types (`lib/streaming/types.ts`)

**Files:**
- Create: `lib/streaming/types.ts`

**Interfaces:**
- Consumes: None
- Produces: All types used by websocket-client, connection-manager, and hooks

- [ ] **Step 1: Write the types file**

```typescript
/**
 * Types for the hybrid WebSocket streaming system.
 *
 * Tier 1: WebSocket (Alchemy WSS) — sub-second latency
 * Tier 3: HTTP Polling (existing system) — silent fallback
 *
 * Tier 2 (SSE) is intentionally skipped for MVP.
 */

/** Blockchain event types we can subscribe to via WebSocket. */
export type SubscriptionType = "newHeads" | "logs" | "newPendingTransactions";

/** The connection method currently in use. */
export type ConnectionMethod = "websocket" | "polling";

/** Connection status states for UI display. */
export type ConnectionStatus =
  | { state: "connecting"; method?: ConnectionMethod }
  | { state: "connected"; method: ConnectionMethod; latency: number }
  | { state: "fallback"; from: "websocket"; reason: string }
  | { state: "error"; message: string };

/** A JSON-RPC 2.0 subscription request. */
export interface SubscriptionRequest {
  id: number;
  jsonrpc: "2.0";
  method: "eth_subscribe" | "eth_unsubscribe";
  params: [SubscriptionType, ...unknown[]] | [string];
}

/** A JSON-RPC 2.0 response (subscription confirmation or error). */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: string | boolean;
  error?: { code: number; message: string };
}

/** A real-time blockchain event pushed from the node. */
export interface BlockchainEvent {
  jsonrpc: "2.0";
  method: "eth_subscription";
  params: {
    subscription: string;
    result: Record<string, unknown>;
  };
}

/** WebSocket client events (event emitter pattern). */
export type WebSocketEventMap = {
  open: () => void;
  message: (event: BlockchainEvent | JsonRpcResponse) => void;
  error: (error: Error) => void;
  close: (code: number, reason: string) => void;
  connecting: () => void;
};

/** Configuration for the WebSocket client. */
export interface WebSocketClientConfig {
  /** WebSocket URL (wss://...) */
  url: string;
  /** Connection timeout in milliseconds (default: 3000) */
  timeoutMs?: number;
  /** Max reconnect attempts (default: 3) */
  maxReconnects?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  reconnectBaseDelayMs?: number;
  /** Max delay for exponential backoff in ms (default: 30000) */
  reconnectMaxDelayMs?: number;
}

/** Configuration for the connection manager. */
export interface ConnectionManagerConfig {
  /** WebSocket URL — if empty, skip to polling */
  wsUrl?: string;
  /** WebSocket client config */
  wsConfig?: Omit<WebSocketClientConfig, "url">;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit lib/streaming/types.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/streaming/types.ts
git commit -m "feat(streaming): add TypeScript types for hybrid streaming system"
```

---

## Task 2: WebSocket Client (`lib/streaming/websocket-client.ts`)

**Files:**
- Create: `lib/streaming/websocket-client.ts`
- Test: `lib/streaming/__tests__/websocket-client.test.ts` (Task 4)

**Interfaces:**
- Consumes: Types from `lib/streaming/types.ts`
- Produces: `WebSocketClient` class with `connect()`, `disconnect()`, `subscribe()`, `unsubscribe()`, `send()` methods

- [ ] **Step 1: Write the WebSocket client**

```typescript
import type {
  BlockchainEvent,
  JsonRpcResponse,
  WebSocketClientConfig,
  WebSocketEventMap,
} from "./types";

const DEFAULT_CONFIG: Required<
  Omit<WebSocketClientConfig, "url">
> = {
  timeoutMs: 3000,
  maxReconnects: 3,
  reconnectBaseDelayMs: 1000,
  reconnectMaxDelayMs: 30000,
};

export class WebSocketClient {
  private config: Required<Omit<WebSocketClientConfig, "url">> & {
    url: string;
  };
  private ws: WebSocket | null = null;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private listeners: Map<keyof WebSocketEventMap, Set<Function>> = new Map();
  private subscriptions: Map<string, string> = new Map(); // subId → subscriptionType
  private requestId = 0;

  constructor(config: WebSocketClientConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config, url: config.url };
  }

  /** Connect to the WebSocket endpoint. Returns true if connected within timeout. */
  async connect(): Promise<boolean> {
    // Don't connect if already connecting or connected
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return this.ws.readyState === WebSocket.OPEN;
    }

    this.emit("connecting");

    return new Promise<boolean>((resolve) => {
      // Set connection timeout
      this.connectTimeout = setTimeout(() => {
        this.cleanup();
        resolve(false);
      }, this.config.timeoutMs);

      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = () => {
          if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
          }
          this.reconnectAttempts = 0;
          this.emit("open");
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = () => {
          // Don't resolve here — wait for onclose which fires after onerror
        };

        this.ws.onclose = (event) => {
          if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
          }

          this.emit("close", event.code, event.reason);

          // If this was a connection attempt (not yet connected), reject
          if (this.reconnectAttempts === 0 && this.subscriptions.size === 0) {
            resolve(false);
            return;
          }

          // If already connected, try to reconnect
          this.attemptReconnect();
        };
      } catch (e) {
        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }
        resolve(false);
      }
    });
  }

  /** Disconnect and cleanup all resources. */
  disconnect(): void {
    this.cleanup();
  }

  /** Subscribe to a blockchain event type. */
  subscribe(type: "newHeads" | "logs" | "newPendingTransactions"): string | null {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return null;
    }

    const id = ++this.requestId;
    const payload = JSON.stringify({
      id,
      jsonrpc: "2.0",
      method: "eth_subscribe",
      params: [type],
    });

    this.ws.send(payload);
    // Subscription ID will be confirmed via message handler
    this.subscriptions.set(`pending-${id}`, type);
    return `pending-${id}`;
  }

  /** Unsubscribe from a subscription. */
  unsubscribe(subscriptionId: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const id = ++this.requestId;
    const payload = JSON.stringify({
      id,
      jsonrpc: "2.0",
      method: "eth_unsubscribe",
      params: [subscriptionId],
    });

    this.ws.send(payload);
    this.subscriptions.delete(subscriptionId);
    return true;
  }

  /** Send a raw JSON-RPC message. */
  send(data: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(data);
    return true;
  }

  /** Check if currently connected. */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Get current connection state. */
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /** Add an event listener. */
  on<K extends keyof WebSocketEventMap>(
    event: K,
    listener: WebSocketEventMap[K]
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Function);
  }

  /** Remove an event listener. */
  off<K extends keyof WebSocketEventMap>(
    event: K,
    listener: WebSocketEventMap[K]
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener as Function);
    }
  }

  /** Emit an event to all listeners. */
  private emit<K extends keyof WebSocketEventMap>(
    event: K,
    ...args: Parameters<WebSocketEventMap[K]>
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((listener) => {
        (listener as (...a: unknown[]) => void)(...args);
      });
    }
  }

  /** Handle incoming WebSocket messages. */
  private handleMessage(data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return; // Ignore non-JSON messages
    }

    const obj = parsed as Record<string, unknown>;

    // Check if it's a subscription event
    if (obj.method === "eth_subscription" && obj.params) {
      this.emit("message", {
        jsonrpc: "2.0",
        method: "eth_subscription",
        params: obj.params as {
          subscription: string;
          result: Record<string, unknown>;
        },
      } as BlockchainEvent);
      return;
    }

    // Check if it's a JSON-RPC response (subscription confirmation)
    if (obj.id !== undefined && obj.jsonrpc === "2.0") {
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: obj.id as number,
        result: obj.result as string | boolean | undefined,
        error: obj.error as { code: number; message: string } | undefined,
      };

      // If it's a subscription confirmation, store the real subscription ID
      if (response.result && typeof response.result === "string") {
        const pendingKey = `pending-${response.id}`;
        const subType = this.subscriptions.get(pendingKey);
        if (subType) {
          this.subscriptions.delete(pendingKey);
          this.subscriptions.set(response.result, subType);
        }
      }

      this.emit("message", response);
    }
  }

  /** Attempt to reconnect with exponential backoff. */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnects) {
      // Max reconnects reached — emit error and stop
      this.emit("error", new Error("Max reconnect attempts reached"));
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectBaseDelayMs * 2 ** (this.reconnectAttempts - 1),
      this.config.reconnectMaxDelayMs
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect().then((connected) => {
        if (!connected) {
          this.attemptReconnect();
        }
      });
    }, delay);
  }

  /** Cleanup all resources. */
  private cleanup(): void {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch {
        // Ignore cleanup errors
      }
      this.ws = null;
    }
    this.subscriptions.clear();
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit lib/streaming/websocket-client.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/streaming/websocket-client.ts
git commit -m "feat(streaming): add WebSocket client with timeout and reconnect"
```

---

## Task 3: Connection Manager (`lib/streaming/connection-manager.ts`)

**Files:**
- Create: `lib/streaming/connection-manager.ts`

**Interfaces:**
- Consumes: `WebSocketClient` from Task 2, types from Task 1
- Produces: `ConnectionManager` class with `start()`, `stop()`, `onStatus()`, `onEvent()` methods

- [ ] **Step 1: Write the connection manager**

```typescript
import { WebSocketClient } from "./websocket-client";
import type {
  BlockchainEvent,
  ConnectionManagerConfig,
  ConnectionMethod,
  ConnectionStatus,
} from "./types";

export class ConnectionManager {
  private config: ConnectionManagerConfig;
  private wsClient: WebSocketClient | null = null;
  private status: ConnectionStatus;
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private eventListeners: Set<(event: BlockchainEvent) => void> = new Set();
  private stopped = false;

  constructor(config: ConnectionManagerConfig = {}) {
    this.config = config;
    this.status = { state: "connecting" };
  }

  /** Start the connection process — tries WebSocket first, falls back to polling. */
  async start(): Promise<void> {
    this.stopped = false;
    this.updateStatus({ state: "connecting" });

    // If no WS URL, skip to polling immediately
    if (!this.config.wsUrl) {
      this.updateStatus({
        state: "fallback",
        from: "websocket",
        reason: "No WebSocket URL configured",
      });
      return;
    }

    // Try WebSocket connection (3s timeout is inside WebSocketClient)
    const wsClient = new WebSocketClient({
      url: this.config.wsUrl,
      ...this.config.wsConfig,
    });

    this.wsClient = wsClient;

    // Wire up event handlers
    wsClient.on("open", () => {
      this.updateStatus({
        state: "connected",
        method: "websocket",
        latency: 0, // Will be updated by first event
      });
    });

    wsClient.on("message", (msg) => {
      // Handle subscription confirmations (ignore)
      if ("result" in msg && typeof msg.result === "string") {
        return;
      }
      // Handle blockchain events
      if ("method" in msg && msg.method === "eth_subscription") {
        this.emitEvent(msg);
      }
    });

    wsClient.on("error", (error) => {
      // Silent fallback — don't show error to user
      this.updateStatus({
        state: "fallback",
        from: "websocket",
        reason: error.message,
      });
    });

    wsClient.on("close", (code, reason) => {
      // If we were connected, try to reconnect
      if (this.status.state === "connected" && this.status.method === "websocket") {
        // Reconnection is handled inside WebSocketClient
        // If max reconnects reached, it emits error → fallback
      } else if (this.status.state === "connecting") {
        // Connection failed — fallback to polling
        this.updateStatus({
          state: "fallback",
          from: "websocket",
          reason: `Connection failed (code ${code}: ${reason})`,
        });
      }
    });

    const connected = await wsClient.connect();

    if (!connected && !this.stopped) {
      // WebSocket failed — silent fallback to polling
      this.updateStatus({
        state: "fallback",
        from: "websocket",
        reason: "Connection timeout or error",
      });
    }

    // If connected, subscribe to newHeads for block notifications
    if (connected && wsClient) {
      wsClient.subscribe("newHeads");
    }
  }

  /** Stop all connections and cleanup. */
  stop(): void {
    this.stopped = true;
    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsClient = null;
    }
  }

  /** Subscribe to additional event types (only works if WebSocket is active). */
  subscribe(type: "newHeads" | "logs" | "newPendingTransactions"): string | null {
    if (this.wsClient && this.wsClient.isConnected) {
      return this.wsClient.subscribe(type);
    }
    return null;
  }

  /** Get current connection status. */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** Get current connection method (for UI). */
  getMethod(): ConnectionMethod {
    if (this.status.state === "connected" && this.status.method) {
      return this.status.method;
    }
    return "polling";
  }

  /** Add a status change listener. */
  onStatus(listener: (status: ConnectionStatus) => void): void {
    this.statusListeners.add(listener);
  }

  /** Remove a status change listener. */
  offStatus(listener: (status: ConnectionStatus) => void): void {
    this.statusListeners.delete(listener);
  }

  /** Add a blockchain event listener. */
  onEvent(listener: (event: BlockchainEvent) => void): void {
    this.eventListeners.add(listener);
  }

  /** Remove a blockchain event listener. */
  offEvent(listener: (event: BlockchainEvent) => void): void {
    this.eventListeners.delete(listener);
  }

  /** Update status and notify all listeners. */
  private updateStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  /** Emit a blockchain event to all listeners. */
  private emitEvent(event: BlockchainEvent): void {
    this.eventListeners.forEach((listener) => listener(event));
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit lib/streaming/connection-manager.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/streaming/connection-manager.ts
git commit -m "feat(streaming): add connection manager with fallback logic"
```

---

## Task 4: Unit Tests (`lib/streaming/__tests__/websocket-client.test.ts`)

**Files:**
- Create: `lib/streaming/__tests__/websocket-client.test.ts`

**Interfaces:**
- Consumes: `WebSocketClient` from Task 2, types from Task 1
- Produces: Test coverage for timeout, reconnect, subscription flow

- [ ] **Step 1: Write unit tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketClient } from "../websocket-client";

// Mock the global WebSocket constructor
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  static instances: MockWebSocket[] = [];

  // Test helpers
  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  triggerMessage(data: string) {
    this.onmessage?.({ data });
  }

  triggerError() {
    this.onerror?.({} as Event);
  }

  triggerClose(code: number, reason: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  send(data: string) {
    this.sentData = data;
  }

  sentData: string = "";

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

// @ts-expect-error - Mock WebSocket for test environment
global.WebSocket = MockWebSocket;

describe("WebSocketClient", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("connect", () => {
    it("should connect successfully when WebSocket opens", async () => {
      const client = new WebSocketClient({
        url: "wss://test.example.com/ws",
      });

      const connectPromise = client.connect();

      // Simulate WebSocket opening
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      const result = await connectPromise;
      expect(result).toBe(true);
      expect(client.isConnected).toBe(true);
    });

    it("should return false when connection times out (3s)", async () => {
      const client = new WebSocketClient({
        url: "wss://test.example.com/ws",
        timeoutMs: 3000,
      });

      const connectPromise = client.connect();

      // Advance time past the timeout
      vi.advanceTimersByTime(3000);

      const result = await connectPromise;
      expect(result).toBe(false);
    });

    it("should return false when WebSocket errors", async () => {
      const client = new WebSocketClient({
        url: "wss://test.example.com/ws",
      });

      const connectPromise = client.connect();

      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerError();
      mockWs.triggerClose(1006, "Connection failed");

      const result = await connectPromise;
      expect(result).toBe(false);
    });
  });

  describe("subscribe", () => {
    it("should send eth_subscribe message when connected", () => {
      const client = new WebSocketClient({
        url: "wss://test.example.com/ws",
      });

      const connectPromise = client.connect();
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      // Wait for connection
      return connectPromise.then(() => {
        const subId = client.subscribe("newHeads");
        expect(subId).not.toBeNull();
        expect(mockWs.sentData).toContain("eth_subscribe");
        expect(mockWs.sentData).toContain("newHeads");
      });
    });

    it("should return null when not connected", () => {
      const client = new WebSocketClient({
        url: "wss://test.example.com/ws",
      });

      const subId = client.subscribe("newHeads");
      expect(subId).toBeNull();
    });
  });

  describe("message handling", () => {
    it("should parse and emit subscription events", async () => {
      const client = new WebSocketClient({
        url: "wss://test.example.com/ws",
      });

      const events: any[] = [];
      client.on("message", (msg) => {
        if ("method" in msg) {
          events.push(msg);
        }
      });

      const connectPromise = client.connect();
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      await connectPromise;

      // Simulate subscription confirmation
      mockWs.triggerMessage(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: "0xabc123",
        })
      );

      // Simulate blockchain event
      mockWs.triggerMessage(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_subscription",
          params: {
            subscription: "0xabc123",
            result: { number: "0x1234", hash: "0xabcdef" },
          },
        })
      );

      expect(events).toHaveLength(1);
      expect(events[0].params.subscription).toBe("0xabc123");
    });
  });

  describe("reconnect", () => {
    it("should attempt reconnect on disconnect after connection", async () => {
      const client = new WebSocketClient({
        url: "wss://test.example.com/ws",
        maxReconnects: 3,
        reconnectBaseDelayMs: 1000,
      });

      const connectPromise = client.connect();
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      await connectPromise;
      expect(client.isConnected).toBe(true);

      // Simulate disconnect
      mockWs.triggerClose(1006, "Network error");

      // Should not be connected immediately
      expect(client.isConnected).toBe(false);

      // Advance time for first reconnect attempt (1s)
      vi.advanceTimersByTime(1000);

      // A new WebSocket instance should be created
      expect(MockWebSocket.instances).toHaveLength(2);

      // Simulate the reconnect succeeding
      MockWebSocket.instances[1].triggerOpen();

      // Wait for reconnect promise to resolve
      await vi.runAllTimersAsync();

      expect(client.isConnected).toBe(true);
    });

    it("should stop reconnecting after max attempts", async () => {
      const client = new WebSocketClient({
        url: "wss://test.example.com/ws",
        maxReconnects: 2,
        reconnectBaseDelayMs: 1000,
      });

      const errorHandler = vi.fn();
      client.on("error", errorHandler);

      const connectPromise = client.connect();
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      await connectPromise;

      // Simulate disconnect
      mockWs.triggerClose(1006, "Network error");

      // Advance through all reconnect attempts
      // Attempt 1: 1s
      vi.advanceTimersByTime(1000);
      MockWebSocket.instances[1].triggerError();
      MockWebSocket.instances[1].triggerClose(1006, "Failed");

      // Attempt 2: 2s
      vi.advanceTimersByTime(2000);
      MockWebSocket.instances[2].triggerError();
      MockWebSocket.instances[2].triggerClose(1006, "Failed");

      // Should have emitted error (max reconnects reached)
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("should clean up resources on disconnect", async () => {
      const client = new WebSocketClient({
        url: "wss://test.example.com/ws",
      });

      await client.connect();
      client.disconnect();

      expect(client.isConnected).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- lib/streaming/__tests__/websocket-client.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add lib/streaming/__tests__/websocket-client.test.ts
git commit -m "test(streaming): add unit tests for WebSocket client"
```

---

## Task 5: React Hooks (`hooks/useBlockchainStream.ts` and `hooks/useConnectionStatus.ts`)

**Files:**
- Create: `hooks/useBlockchainStream.ts`
- Create: `hooks/useConnectionStatus.ts`

**Interfaces:**
- Consumes: `ConnectionManager` from Task 3, types from Task 1
- Produces: React hooks that expose streaming state to components

- [ ] **Step 1: Write `useBlockchainStream.ts`**

```typescript
import { useEffect, useRef, useState } from "react";
import { ConnectionManager } from "@/lib/streaming/connection-manager";
import type {
  BlockchainEvent,
  ConnectionStatus,
} from "@/lib/streaming/types";

interface UseBlockchainStreamResult {
  /** Current connection status */
  status: ConnectionStatus;
  /** Current connection method */
  method: "websocket" | "polling";
  /** Latest blockchain events */
  events: BlockchainEvent[];
  /** Whether the stream is active */
  isActive: boolean;
  /** Subscribe to additional event types */
  subscribe: (type: "newHeads" | "logs" | "newPendingTransactions") => string | null;
}

/**
 * React hook that manages the hybrid WebSocket streaming connection.
 *
 * Automatically tries WebSocket first, falls back to polling silently.
 * Returns connection status and blockchain events.
 */
export function useBlockchainStream(): UseBlockchainStreamResult {
  const [status, setStatus] = useState<ConnectionStatus>({ state: "connecting" });
  const [events, setEvents] = useState<BlockchainEvent[]>([]);
  const managerRef = useRef<ConnectionManager | null>(null);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WSS_URL;

    const manager = new ConnectionManager({
      wsUrl: wsUrl || undefined,
    });

    managerRef.current = manager;

    manager.onStatus(setStatus);

    manager.onEvent((event) => {
      setEvents((prev) => [...prev.slice(-99), event]); // Keep last 100 events
    });

    manager.start();

    return () => {
      manager.stop();
    };
  }, []);

  const subscribe = (type: "newHeads" | "logs" | "newPendingTransactions") => {
    return managerRef.current?.subscribe(type) ?? null;
  };

  const method: "websocket" | "polling" =
    status.state === "connected" && status.method
      ? status.method
      : "polling";

  const isActive = status.state === "connected" || status.state === "fallback";

  return {
    status,
    method,
    events,
    isActive,
    subscribe,
  };
}
```

- [ ] **Step 2: Write `useConnectionStatus.ts`**

```typescript
import { useEffect, useState } from "react";
import { useBlockchainStream } from "./useBlockchainStream";
import type { ConnectionStatus } from "@/lib/streaming/types";

interface ConnectionStatusResult {
  /** Current connection status */
  status: ConnectionStatus;
  /** Connection method for UI display */
  method: "websocket" | "polling";
  /** Whether connected (either WS or polling) */
  isConnected: boolean;
  /** Whether using WebSocket (real-time) */
  isRealTime: boolean;
  /** Human-readable status text */
  statusText: string;
}

/**
 * React hook for connection status display.
 *
 * Provides simplified status information for UI components.
 * Uses useBlockchainStream internally.
 */
export function useConnectionStatus(): ConnectionStatusResult {
  const { status, method } = useBlockchainStream();

  const isConnected = status.state === "connected" || status.state === "fallback";
  const isRealTime = status.state === "connected" && method === "websocket";

  let statusText: string;
  switch (status.state) {
    case "connecting":
      statusText = "Connecting...";
      break;
    case "connected":
      statusText =
        method === "websocket"
          ? "Live via WebSocket"
          : "Live via polling";
      break;
    case "fallback":
      statusText = "Polling (WebSocket unavailable)";
      break;
    case "error":
      statusText = "Connection error";
      break;
    default:
      statusText = "Disconnected";
  }

  return {
    status,
    method,
    isConnected,
    isRealTime,
    statusText,
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit hooks/useBlockchainStream.ts hooks/useConnectionStatus.ts`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add hooks/useBlockchainStream.ts hooks/useConnectionStatus.ts
git commit -m "feat(streaming): add React hooks for blockchain streaming"
```

---

## Task 6: ConnectionStatus Component (`components/ConnectionStatus.tsx`)

**Files:**
- Create: `components/ConnectionStatus.tsx`

**Interfaces:**
- Consumes: `useConnectionStatus` from Task 5
- Produces: UI component for connection status indicator

- [ ] **Step 1: Write the ConnectionStatus component**

```tsx
import { useConnectionStatus } from "@/hooks/useConnectionStatus";

/**
 * Connection status indicator component.
 *
 * Shows a small LED indicator with tooltip explaining the current
 * connection method (WebSocket real-time vs polling fallback).
 *
 * Place in header or sidebar — minimal footprint.
 */
export function ConnectionStatus() {
  const { method, isRealTime, statusText, status } = useConnectionStatus();

  // Color coding: green (WS), yellow (polling), gray (connecting/error)
  let bgColor: string;
  let borderColor: string;

  if (status.state === "connected" && method === "websocket") {
    bgColor = "bg-green-500";
    borderColor = "border-green-400";
  } else if (status.state === "connected" || status.state === "fallback") {
    bgColor = "bg-yellow-500";
    borderColor = "border-yellow-400";
  } else {
    bgColor = "bg-gray-400";
    borderColor = "border-gray-300";
  }

  return (
    <div className="flex items-center gap-2" title={statusText}>
      <div
        className={`w-2 h-2 rounded-full ${bgColor} animate-pulse ${borderColor} border-2`}
        aria-label={statusText}
      />
      <span className="text-xs text-muted-foreground" title={statusText}>
        {isRealTime ? "Live" : statusText}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit components/ConnectionStatus.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/ConnectionStatus.tsx
git commit -m "feat(streaming): add ConnectionStatus UI indicator component"
```

---

## Task 7: Environment Variable (`.env.example`)

**Files:**
- Modify: `.env.example`

**Interfaces:**
- Consumes: None
- Produces: Updated env example with WebSocket URL

- [ ] **Step 1: Add NEXT_PUBLIC_WSS_URL to .env.example**

Find the Robinhood Chain RPC section and add:

```dotenv
# ── WebSocket Streaming (optional) ────────────────────────────
# Alchemy WebSocket endpoint for real-time blockchain updates.
# If empty or invalid, the app silently falls back to HTTP polling.
# Robinhood public RPC does NOT support WebSocket, so Alchemy is required.
# Get a free Alchemy key at https://alchemy.com
# NEXT_PUBLIC_WSS_URL=wss://robinhood-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add NEXT_PUBLIC_WSS_URL to env example"
```

---

## Task 8: Integrate ConnectionStatus into TrackerApp

**Files:**
- Modify: `components/TrackerApp.tsx`

**Interfaces:**
- Consumes: `ConnectionStatus` from Task 6
- Produces: Integrated status indicator in main app

- [ ] **Step 1: Read current TrackerApp.tsx**

Run: `cat components/TrackerApp.tsx` (or use Read tool)

- [ ] **Step 2: Add ConnectionStatus import and component**

Add to imports:
```typescript
import { ConnectionStatus } from "./ConnectionStatus";
```

Add to JSX (recommended: top-right of header or near existing status indicators):
```tsx
<ConnectionStatus />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add components/TrackerApp.tsx
git commit -m "feat(streaming): integrate ConnectionStatus into TrackerApp"
```

---

## Task 9: Final Verification

**Files:**
- Run all tests
- Run typecheck
- Verify no regressions

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (existing + new)

- [ ] **Step 2: Run TypeScript typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Manual verification checklist**

| Test Case | Expected Result |
|-----------|----------------|
| App loads with valid WSS URL | WebSocket connects, "Live via WebSocket" shown |
| App loads with invalid WSS URL | Silent fallback to polling within 3s |
| App loads with empty WSS URL | Direct to polling, no connection attempt |
| AdBlocker blocks WSS | Silent fallback to polling |
| Network drop mid-stream | Reconnect attempt, then fallback if fails |
| Component unmount | WebSocket disconnects cleanly |

- [ ] **Step 5: Commit any fixes**

```bash
git add .
git commit -m "fix: any fixes from verification"
```

---

## Verification Checklist

- [ ] All TypeScript compiles without errors
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] No lint errors
- [ ] WebSocket connects to Alchemy WSS
- [ ] Silent fallback works when WS fails
- [ ] ConnectionStatus component displays correctly
- [ ] No regressions in existing functionality
- [ ] .env.example updated
- [ ] Design doc committed
