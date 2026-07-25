/**
 * Pure SSE (Server-Sent Events) client for blockchain node subscriptions.
 * Client-side safe — uses native EventSource API.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - JSON-RPC 2.0 subscription helpers
 * - Event emitter pattern for connection/message/error events
 * - Silent failure (emits 'error' event, doesn't throw)
 * - Compatible with blockchain nodes that support SSE (e.g., some Ethereum nodes)
 */

import type {
  BlockchainEvent,
  JsonRpcResponse,
  WebSocketEventMap,
} from "./types";

/** Configuration for the SSE client. */
export interface SSEClientConfig {
  /** SSE URL (http://... or https://...) */
  url: string;
  /** Connection timeout in milliseconds (default: 5000) */
  timeoutMs?: number;
  /** Max reconnect attempts (default: 3) */
  maxReconnects?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  reconnectBaseDelayMs?: number;
  /** Max delay for exponential backoff in ms (default: 30000) */
  reconnectMaxDelayMs?: number;
  /** Additional headers for the SSE connection */
  headers?: Record<string, string>;
}

const DEFAULT_SSE_CONFIG: Required<
  Omit<SSEClientConfig, "url" | "headers">
> = {
  timeoutMs: 5000,
  maxReconnects: 3,
  reconnectBaseDelayMs: 1000,
  reconnectMaxDelayMs: 30000,
};

export class SSEClient {
  private config: Required<Omit<SSEClientConfig, "url" | "headers">> & {
    url: string;
    headers?: Record<string, string>;
  };
  private eventSource: EventSource | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private listeners: Map<keyof WebSocketEventMap, Set<Function>> = new Map();
  private subscriptions: Map<string, string> = new Map(); // subId → subscriptionType
  private requestId = 0;
  private isConnecting = false;

  constructor(config: SSEClientConfig) {
    this.config = { ...DEFAULT_SSE_CONFIG, ...config, url: config.url };
  }

  /** Connect to the SSE endpoint. Returns true if connected. */
  async connect(): Promise<boolean> {
    if (this.eventSource && this.eventSource.readyState === EventSource.OPEN) {
      return true;
    }

    if (this.isConnecting) {
      return false;
    }

    this.isConnecting = true;
    this.emit("connecting" as keyof WebSocketEventMap);

    return new Promise<boolean>((resolve) => {
      try {
        // Note: EventSource doesn't support custom headers in native implementation
        // For nodes requiring auth headers, you may need to use fetch-based SSE
        this.eventSource = new EventSource(this.config.url);

        this.eventSource.onopen = () => {
          this.reconnectAttempts = 0;
          this.isConnecting = false;
          this.emit("open" as keyof WebSocketEventMap);
          resolve(true);
        };

        this.eventSource.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.eventSource.onerror = () => {
          if (this.eventSource?.readyState === EventSource.CLOSED) {
            this.isConnecting = false;
            this.emit("close" as keyof WebSocketEventMap, 1000, "SSE connection closed");
            
            // Attempt reconnection
            this.attemptReconnect();
            resolve(false);
          }
        };

        // Set connection timeout
        setTimeout(() => {
          if (this.isConnecting) {
            this.cleanup();
            resolve(false);
          }
        }, this.config.timeoutMs);
      } catch (e) {
        this.isConnecting = false;
        resolve(false);
      }
    });
  }

  /** Disconnect and cleanup all resources. */
  disconnect(): void {
    this.cleanup();
  }

  /** Subscribe to a blockchain event type (for SSE, this typically uses a different mechanism). */
  subscribe(type: "newHeads" | "logs" | "newPendingTransactions"): string | null {
    if (!this.eventSource || this.eventSource.readyState !== EventSource.OPEN) {
      return null;
    }

    // SSE subscriptions work differently - typically you'd listen to specific event types
    // This is a placeholder for nodes that support SSE subscriptions
    const id = `sse-sub-${++this.requestId}`;
    this.subscriptions.set(id, type);
    
    // For standard SSE endpoints, you might need to make a separate HTTP request
    // to subscribe, depending on the node's API
    return id;
  }

  /** Unsubscribe from a subscription. */
  unsubscribe(subscriptionId: string): boolean {
    this.subscriptions.delete(subscriptionId);
    return true;
  }

  /** Check if currently connected. */
  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  /** Get current connection state. */
  get readyState(): number {
    return this.eventSource?.readyState ?? EventSource.CLOSED;
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

  /** Handle incoming SSE messages. */
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
      this.emit("message" as keyof WebSocketEventMap, {
        jsonrpc: "2.0",
        method: "eth_subscription",
        params: obj.params as {
          subscription: string;
          result: Record<string, unknown>;
        },
      } as BlockchainEvent);
      return;
    }

    // Check if it's a JSON-RPC response
    if (obj.id !== undefined && obj.jsonrpc === "2.0") {
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: obj.id as number,
        result: obj.result as string | boolean | undefined,
        error: obj.error as { code: number; message: string } | undefined,
      };
      this.emit("message" as keyof WebSocketEventMap, response);
    }
  }

  /** Attempt to reconnect with exponential backoff. */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnects) {
      this.emit("error" as keyof WebSocketEventMap, new Error("Max reconnect attempts reached"));
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
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.subscriptions.clear();
    this.isConnecting = false;
  }
}
