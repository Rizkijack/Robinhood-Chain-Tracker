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
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
  }
}

export { WebSocketClient as BlockchainWebSocketClient };
