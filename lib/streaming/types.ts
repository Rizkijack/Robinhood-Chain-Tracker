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
export type ConnectionMethod = "websocket" | "sse" | "polling";

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
  open: (data: { url: string }) => void;
  message: (event: BlockchainEvent | JsonRpcResponse) => void;
  error: (error: Error) => void;
  close: (code: number, reason: string) => void;
  connecting: () => void;
  fallback: (data: { reason: string }) => void;
  subscribed: (data: { subscriptionId: string; type: string }) => void;
  event: (data: { subscription: string; data: unknown }) => void;
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

/** Connection snapshot for UI state. */
export interface ConnectionSnapshot {
  status: "connecting" | "connected" | "reconnecting" | "error";
  method: ConnectionMethod;
  reason: string;
  latestBlock: string | null;
  latencyMs: number | null;
  lastEventAt: number | null;
  reconnectAttempts: number;
}

/** Initial snapshot state. */
export const INITIAL_SNAPSHOT: ConnectionSnapshot = {
  status: "connecting",
  method: "polling",
  reason: "",
  latestBlock: null,
  latencyMs: null,
  lastEventAt: null,
  reconnectAttempts: 0,
};

/** Reason for fallback to polling. */
export type FallbackReason = 
  | "ws-unavailable"
  | "ws-error"
  | "ws-closed"
  | "sse-error"
  | "sse-closed"
  | "streaming-unavailable"
  | "streaming-error"
  | "manual";

/** Blockchain node configuration. */
export interface BlockchainNodeConfig {
  /** Node name for display */
  name: string;
  /** WebSocket URL (wss://...) */
  wsUrl?: string;
  /** SSE URL (http://... or https://...) */
  sseUrl?: string;
  /** HTTP RPC URL for polling */
  httpUrl?: string;
  /** Chain ID */
  chainId: number;
  /** Whether this node supports native subscriptions */
  supportsSubscriptions: boolean;
}
