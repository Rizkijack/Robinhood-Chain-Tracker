/**
 * Shared TypeScript types for the hybrid blockchain streaming system.
 *
 * The system uses a 3-tier defense strategy:
 *   Tier 1: WebSocket (primary, sub-second latency)
 *   Tier 2: SSE (skipped for MVP — see design doc)
 *   Tier 3: HTTP polling (existing stable system, silent fallback)
 *
 * This module is safe to import from both client and server code —
 * it contains only types, no runtime values.
 */

/* ── Connection state ──────────────────────────────────────── */

/**
 * Which transport is currently carrying real-time data.
 * - `websocket`: Tier 1 active — direct WSS to blockchain node.
 * - `polling`: Tier 3 active — falling back to existing HTTP polling.
 *
 * The connection-manager never exposes an "error" method because
 * failures are silent: if WebSocket dies, polling takes over without
 * interrupting the user.
 */
export type ConnectionMethod = "websocket" | "polling";

/**
 * High-level status of the streaming connection.
 *
 * The state machine transitions are:
 *   connecting → connected (websocket | polling)
 *   connected  → reconnecting (WS dropped, trying again)
 *   reconnecting → connected (websocket | polling)
 *   any → disconnected (manual shutdown only)
 */
export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

/**
 * Why the system is using its current method. Useful for tooltips
 * and debugging. Empty string means "default / no special reason".
 */
export type FallbackReason =
  | ""
  | "ws-timeout"
  | "ws-error"
  | "ws-closed"
  | "ws-unavailable"
  | "manual";

/* ── JSON-RPC 2.0 (Ethereum-style subscriptions) ───────────── */

/**
 * Ethereum JSON-RPC subscription types supported by Alchemy WSS.
 * See https://docs.alchemy.com/reference/eth-subscribe-api
 *
 * - `newHeads`: fires on every new block (header).
 * - `newPendingTransactions`: fires on every pending tx hash.
 * - `logs`: fires when a log matching the filter is emitted.
 */
export type SubscriptionType =
  | "newHeads"
  | "newPendingTransactions"
  | "logs";

/** Params for an `eth_subscribe` request. */
export type SubscriptionParams =
  | [SubscriptionType] // newHeads / newPendingTransactions
  | [SubscriptionType, { address?: string; topics?: string[] }]; // logs

/** Request payload sent over WebSocket to start a subscription. */
export interface JsonRpcRequest {
  id: number;
  jsonrpc: "2.0";
  method: "eth_subscribe" | "eth_unsubscribe";
  params: SubscriptionParams | [string]; // [subscriptionId] for unsubscribe
}

/** Successful subscription confirmation response. */
export interface JsonRpcSubscriptionResponse {
  id: number;
  jsonrpc: "2.0";
  result: string; // subscription ID (hex)
}

/** Streaming event payload pushed by the node. */
export interface JsonRpcEvent {
  jsonrpc: "2.0";
  method: "eth_subscription";
  params: {
    subscription: string;
    result: BlockchainEvent;
  };
}

/** Error response from the node. */
export interface JsonRpcError {
  id: number | null;
  jsonrpc: "2.0";
  error: { code: number; message: string };
}

export type WebSocketMessage =
  | JsonRpcSubscriptionResponse
  | JsonRpcEvent
  | JsonRpcError;

/* ── Blockchain event payloads ─────────────────────────────── */

/**
 * New block header (result of `newHeads` subscription).
 * All fields are hex-encoded strings as returned by the node.
 */
export interface NewHeadsEvent {
  baseFeePerGas?: string;
  difficulty?: string;
  extraData?: string;
  gasLimit?: string;
  gasUsed?: string;
  hash?: string;
  logsBloom?: string;
  miner?: string;
  mixHash?: string;
  nonce?: string;
  number?: string;
  parentHash?: string;
  receiptsRoot?: string;
  sha3Uncles?: string;
  stateRoot?: string;
  timestamp?: string;
  totalDifficulty?: string;
  transactionsRoot?: string;
}

/** Pending transaction hash (result of `newPendingTransactions`). */
export interface PendingTxEvent {
  hash: string;
  from?: string;
  to?: string;
}

/** Log entry (result of `logs` subscription). */
export interface LogEvent {
  address: string;
  topics: string[];
  data: string;
  blockNumber?: string;
  transactionHash?: string;
  transactionIndex?: string;
  blockHash?: string;
  logIndex?: string;
  removed?: boolean;
}

/** Discriminated union of all blockchain events we may receive. */
export type BlockchainEvent =
  | NewHeadsEvent
  | PendingTxEvent
  | LogEvent
  | Record<string, unknown>;

/* ── Public events emitted by the WebSocket client ──────────── */

/**
 * Events emitted by the WebSocket client. Defined as a mapped type so
 * it satisfies the `Record<string, unknown>` constraint used by the
 * Emitter base class (plain interfaces don't carry an index signature).
 */
export type ClientEvents = {
  /** Fired when the WS handshake completes successfully. */
  open: { url: string; latencyMs: number };
  /** Fired for every blockchain event pushed by the node. */
  event: { subscription: string; data: BlockchainEvent };
  /** Fired when the connection drops (will trigger reconnect logic). */
  close: { code: number; reason: string; wasClean: boolean };
  /** Fired on any WS error — always non-fatal, used for diagnostics. */
  error: { message: string };
  /** Fired when a subscription is confirmed by the node. */
  subscribed: { subscriptionId: string; type: SubscriptionType };
  /** Fired when max reconnect attempts exhausted (permanent fallback). */
  fallback: { reason: FallbackReason };
};

/* ── Connection manager snapshot ────────────────────────────── */

/**
 * Read-only snapshot of the connection-manager state.
 * The React hooks subscribe to this so they re-render on changes.
 */
export interface ConnectionSnapshot {
  status: ConnectionStatus;
  method: ConnectionMethod;
  reason: FallbackReason;
  /** How many times we've tried to reconnect (resets on success). */
  reconnectAttempts: number;
  /** Latest block number if known (hex string from newHeads). */
  latestBlock: string | null;
  /** Latency of the most recent successful handshake (ms). */
  latencyMs: number | null;
  /** ISO timestamp of last received event. */
  lastEventAt: number | null;
}

export const INITIAL_SNAPSHOT: ConnectionSnapshot = {
  status: "disconnected",
  method: "polling",
  reason: "",
  reconnectAttempts: 0,
  latestBlock: null,
  latencyMs: null,
  lastEventAt: null,
};
