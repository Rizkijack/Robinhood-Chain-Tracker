/**
 * Streaming module - exports all streaming-related components.
 *
 * This module provides:
 * - WebSocket client for blockchain node subscriptions
 * - SSE client for blockchain node subscriptions
 * - Connection manager for managing streaming connections
 * - Types for blockchain events and subscriptions
 */

export { WebSocketClient as BlockchainWebSocketClient } from "./websocket-client";
export { SSEClient } from "./sse-client";
export { getConnectionManager, _resetConnectionManager, BLOCKCHAIN_NODES } from "./connection-manager";
export type {
  BlockchainNodeConfig,
  ConnectionMethod,
  ConnectionSnapshot,
  FallbackReason,
  SubscriptionType,
  BlockchainEvent,
  JsonRpcResponse,
  WebSocketClientConfig,
  SSEClientConfig,
} from "./types";

// Re-export types for convenience
export type { WebSocketEventMap } from "./types";
