/**
 * Pure WebSocket client for blockchain node subscriptions.
 * Client-side safe — uses native WebSocket API.
 *
 * Features:
 * - 3-second connection timeout (configurable)
 * - Auto-reconnect with exponential backoff
 * - JSON-RPC 2.0 subscription helpers (eth_subscribe / eth_unsubscribe)
 * - Event emitter pattern for connection/message/error events
 * - Silent failure (emits 'fallback' event, doesn't throw)
 */

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

export interface ConnectResult {
  ok: boolean;
  reason: string;
  latencyMs: number;
}

export class BlockchainWebSocketClient {
  private config: Required<Omit<WebSocketClientConfig, "url">>;
  private ws: WebSocket | null = null;
  private url: string = "";
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private listeners: Map<keyof WebSocketEventMap, Set<Function>> = new Map();
  private subscriptions: Map<string, string> = new Map();
  private pendingSubscriptions: Map<number, string> = new Map();
  private requestId = 0;
  private connectResolve: ((result: ConnectResult) => void) | null = null;
  private connectResolved = false;
  private connectStartTime = 0;
  private isDisposed = false;

  constructor(config: WebSocketClientConfig = { url: "" }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Connect to the WebSocket endpoint. Returns a result object. */
  async connect(url?: string): Promise<ConnectResult> {
    if (url) {
      this.url = url;
    }
    this.connectStartTime = Date.now();
    this.connectResolved = false;
    this.isDisposed = false;

    return new Promise<ConnectResult>((resolve) => {
      this.connectResolve = resolve;

      this.connectTimeout = setTimeout(() => {
        if (this.connectResolved) return;
        this.connectResolved = true;
        this.cleanup();
        this.emit("error", new Error("Connection timeout"));
        resolve({ ok: false, reason: "ws-timeout", latencyMs: this.config.timeoutMs });
      }, this.config.timeoutMs);

      try {
        this.ws = new WebSocket(this.url);
        this.setupWsHandlers();
      } catch {
        if (this.connectResolved) return;
        this.connectResolved = true;
        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }
        this.emit("error", new Error("WebSocket constructor failed"));
        resolve({ ok: false, reason: "ws-error", latencyMs: 0 });
      }
    });
  }

  private setupWsHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      if (this.connectResolved) return;
      this.connectResolved = true;
      if (this.connectTimeout) {
        clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
      }
      this.reconnectAttempts = 0;
      const latency = Date.now() - this.connectStartTime;
      this.emit("open", { url: this.url });
      this.connectResolve?.({ ok: true, reason: "", latencyMs: latency });
      this.connectResolve = null;
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onerror = () => {
      if (this.connectResolved) return;
      this.connectResolved = true;
      if (this.connectTimeout) {
        clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
      }
      this.emit("error", new Error("WebSocket error"));
      this.connectResolve?.({ ok: false, reason: "ws-error", latencyMs: 0 });
      this.connectResolve = null;
    };

    this.ws.onclose = (event) => {
      if (this.connectTimeout) {
        clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
      }

      if (!this.connectResolved && this.connectResolve) {
        this.connectResolved = true;
        this.emit("error", new Error("WebSocket closed during connect"));
        this.connectResolve({ ok: false, reason: "ws-error", latencyMs: 0 });
        this.connectResolve = null;
      }

      if (!this.isDisposed) {
        this.attemptReconnect();
      }
    };
  }

  /** Disconnect and cleanup all resources. */
  disconnect(): void {
    this.isDisposed = true;
    this.cleanup();
  }

  /** Subscribe to a blockchain event type. */
  subscribe(type: "newHeads" | "logs" | "newPendingTransactions"): string {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return "";
    }

    const id = ++this.requestId;
    const payload = JSON.stringify({
      id,
      jsonrpc: "2.0",
      method: "eth_subscribe",
      params: [type],
    });

    this.ws.send(payload);
    const pendingKey = `pending-${id}`;
    this.pendingSubscriptions.set(id, type);
    return pendingKey;
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
      return;
    }

    const obj = parsed as Record<string, unknown>;

    if (obj.method === "eth_subscription" && obj.params) {
      const params = obj.params as {
        subscription: string;
        result: Record<string, unknown>;
      };
      this.emit("event", {
        subscription: params.subscription,
        data: params.result,
      });
      return;
    }

    if (obj.id !== undefined && obj.jsonrpc === "2.0") {
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: obj.id as number,
        result: obj.result as string | boolean | undefined,
        error: obj.error as { code: number; message: string } | undefined,
      };

      if (response.result && typeof response.result === "string") {
        const pendingType = this.pendingSubscriptions.get(response.id);
        if (pendingType) {
          this.pendingSubscriptions.delete(response.id);
          this.subscriptions.set(response.result, pendingType);
          this.emit("subscribed", {
            subscriptionId: response.result,
            type: pendingType,
          });
        }
      }

      this.emit("message", response);
    }
  }

  /** Attempt to reconnect with exponential backoff. */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnects) {
      this.emit("fallback", { reason: "ws-closed" });
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectBaseDelayMs * 2 ** (this.reconnectAttempts - 1),
      this.config.reconnectMaxDelayMs
    );

    this.reconnectTimeout = setTimeout(() => {
      if (this.isDisposed) return;
      this.connect().then((result) => {
        if (!result.ok && !this.isDisposed) {
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
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.pendingSubscriptions.clear();
  }
}

export { BlockchainWebSocketClient as WebSocketClient };
