/**
 * Pure WebSocket client for blockchain node subscriptions.
 *
 * Design goals (see docs/superpowers/specs/2026-07-25-hybrid-websocket-streaming-design.md):
 *
 *   1. **3-second connection timeout** — if the WS handshake doesn't
 *      complete within 3s, give up silently so the connection-manager
 *      can fall back to polling. This handles AdBlockers, VPNs, and
 *      CORS-restricted nodes without blocking the UI.
 *
 *   2. **Auto-reconnect with exponential backoff** — on mid-stream
 *      drops, retry up to MAX_RECONNECT_ATTEMPTS times (1s, 2s, 4s).
 *      After that, emit `fallback` so the manager switches to polling.
 *
 *   3. **Silent failure** — this client never throws. All errors are
 *      emitted as events. The caller decides whether to fall back.
 *
 *   4. **Framework-agnostic** — no React, no viem, no Next.js deps.
 *      Only the browser WebSocket API + a tiny event emitter.
 *
 * This module is browser-only. It guards `typeof WebSocket` so it
 * can be imported during SSR without crashing, but `connect()` will
 * resolve(false) on the server.
 */

import type {
  BlockchainEvent,
  ClientEvents,
  FallbackReason,
  JsonRpcRequest,
  SubscriptionParams,
  SubscriptionType,
  WebSocketMessage,
} from "./types";

/* ── Tuning constants ────────────────────────────────────────── */

/** Hard timeout for the initial WS handshake. */
const CONNECT_TIMEOUT_MS = 3_000;

/** Maximum reconnect attempts before giving up (permanent fallback). */
const MAX_RECONNECT_ATTEMPTS = 3;

/** Base delay for exponential backoff (1s, 2s, 4s). */
const RECONNECT_BASE_DELAY_MS = 1_000;

/**
 * readyState value for an open WebSocket. We read it lazily from the
 * global WebSocket constructor if present (so it stays in sync with
 * the runtime), falling back to the spec value (1) for environments
 * where the constructor isn't defined (SSR, vitest's node env with a
 * mock that doesn't expose constants).
 */
const WS_OPEN = 1;
function isOpen(ws: WebSocket | null): boolean {
  if (!ws) return false;
  // Prefer the runtime's own constant if it's there.
  const open = (globalThis.WebSocket as unknown as { OPEN?: number })?.OPEN;
  return ws.readyState === (open ?? WS_OPEN);
}

/* ── Tiny typed event emitter ────────────────────────────────── */
type Handler<T> = (payload: T) => void;

/**
 * Minimal typed event emitter. The `Events` parameter maps event names
 * to their payload types; we don't require an index signature so plain
 * interfaces (like ClientEvents) can be used directly.
 */
class Emitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Set<Handler<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    (this.handlers[event] ??= new Set()).add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.handlers[event]?.delete(handler);
  }

  protected emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers[event];
    if (!set) return;
    // Copy to array so handlers can safely unsubscribe mid-emit.
    for (const h of [...set]) {
      try {
        h(payload);
      } catch {
        // A handler error must not break the stream. Swallow.
      }
    }
  }
}

/* ── WebSocket client ────────────────────────────────────────── */

export interface ConnectResult {
  ok: boolean;
  /** Latency in ms from connect() call to WS open. Null if not connected. */
  latencyMs: number | null;
  /** Reason for failure, used by the connection-manager. */
  reason: FallbackReason;
}

/**
 * Browser WebSocket client with subscription management and
 * automatic reconnection.
 *
 * Lifecycle:
 *   const c = new BlockchainWebSocketClient();
 *   const r = await c.connect(url);      // try WSS, 3s timeout
 *   if (r.ok) c.subscribe("newHeads");  // start streaming
 *   c.on("event", ...);                 // receive events
 *   c.disconnect();                     // permanent shutdown
 */
export class BlockchainWebSocketClient extends Emitter<ClientEvents> {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private nextRequestId = 1;

  /** Active subscriptions: type → subscription ID returned by node. */
  private readonly pending = new Map<number, SubscriptionType>();
  private readonly active = new Map<string, SubscriptionType>();
  /** Queue of subscriptions to re-establish after reconnect. */
  private readonly desired = new Set<SubscriptionType>();

  private disposed = false;

  /** Try to open a WebSocket connection. Resolves within 3 seconds. */
  connect(url: string): Promise<ConnectResult> {
    // Server-side guard: WebSocket is browser-only.
    if (typeof WebSocket === "undefined") {
      return Promise.resolve({
        ok: false,
        latencyMs: null,
        reason: "ws-unavailable",
      });
    }

    // If already connected to the same URL, succeed immediately.
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.url === url) {
      return Promise.resolve({ ok: true, latencyMs: 0, reason: "" });
    }

    // Tear down any lingering socket before starting fresh.
    this.cleanupSocket();

    this.url = url;
    this.disposed = false;
    const startedAt = Date.now();

    return new Promise<ConnectResult>((resolve) => {
      let settled = false;
      /** Did this socket ever complete its handshake? Distinguishes a
       *  mid-stream drop (reconnect) from a connect-phase failure. */
      let hadOpen = false;
      const finish = (result: ConnectResult) => {
        if (settled) return;
        settled = true;
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }
        resolve(result);
      };

      // 3-second timeout: if the WS doesn't open in time, give up.
      this.connectTimer = setTimeout(() => {
        this.emit("error", { message: "Connection timeout (3s)" });
        finish({ ok: false, latencyMs: null, reason: "ws-timeout" });
        // Don't call cleanupSocket here — let onclose/onerror handle it.
        try {
          this.ws?.close();
        } catch {
          // ignore
        }
      }, CONNECT_TIMEOUT_MS);

      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        finish({
          ok: false,
          latencyMs: null,
          reason: "ws-error",
        });
        this.emit("error", { message: `WS constructor failed: ${String((e as Error)?.message ?? e)}` });
        return;
      }

      this.ws.onopen = () => {
        hadOpen = true;
        const latencyMs = Date.now() - startedAt;
        this.reconnectAttempts = 0;
        this.emit("open", { url, latencyMs });
        finish({ ok: true, latencyMs, reason: "" });

        // Re-establish any subscriptions the caller wanted.
        // (On fresh connect, `desired` may be empty; on reconnect,
        // it holds the types from before the drop.)
        this.resubscribeAll();
      };

      this.ws.onmessage = (e: MessageEvent) => {
        this.handleMessage(e.data);
      };

      this.ws.onerror = () => {
        this.emit("error", { message: "WebSocket error" });
        // Connect-phase error (before open): resolve as a connect failure.
        // onclose will follow, but the `settled` guard prevents a
        // double-resolve. Mid-stream errors are left to onclose.
        if (!hadOpen) {
          finish({ ok: false, latencyMs: null, reason: "ws-error" });
        }
      };

      this.ws.onclose = (e: CloseEvent) => {
        this.emit("close", {
          code: e.code,
          reason: e.reason,
          wasClean: e.wasClean,
        });

        if (this.disposed) return;

        if (hadOpen) {
          // Mid-stream drop after a successful handshake → reconnect.
          if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            this.scheduleReconnect();
          } else {
            this.emit("fallback", { reason: "ws-closed" });
          }
        } else {
          // Connect-phase close (socket never opened). Resolve the
          // promise if not already (e.g. a bare close with no prior
          // error/timeout). Then decide on reconnect.
          finish({ ok: false, latencyMs: null, reason: "ws-closed" });
          // Only reconnect if this was itself a reconnect attempt —
          // an initial-connect failure is left to the connection-manager,
          // which falls back to polling.
          if (this.reconnectAttempts > 0) {
            if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              this.scheduleReconnect();
            } else {
              this.emit("fallback", { reason: "ws-closed" });
            }
          }
        }
      };
    });
  }

  /** Subscribe to a blockchain event stream. Returns the request id. */
  subscribe(type: SubscriptionType, params?: SubscriptionParams[1]): number {
    this.desired.add(type);
    const id = this.nextRequestId++;
    const req: JsonRpcRequest = {
      id,
      jsonrpc: "2.0",
      method: "eth_subscribe",
      params: params ? [type, params] : [type],
    };
    this.pending.set(id, type);
    this.send(req);
    return id;
  }

  /** Cancel an active subscription by type. */
  unsubscribe(type: SubscriptionType): void {
    this.desired.delete(type);
    const entry = [...this.active.entries()].find(([, t]) => t === type);
    if (!entry) return;
    const [subId] = entry;
    this.active.delete(subId);
    this.send({
      id: this.nextRequestId++,
      jsonrpc: "2.0",
      method: "eth_unsubscribe",
      params: [subId],
    });
  }

  /** Permanently shut down the client. No reconnects will happen. */
  disconnect(): void {
    this.disposed = true;
    this.desired.clear();
    this.active.clear();
    this.pending.clear();
    this.cleanupSocket();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /* ── Internals ─────────────────────────────────────────────── */

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return;
    }
    this.reconnectAttempts++;
    const delay = RECONNECT_BASE_DELAY_MS * 2 ** (this.reconnectAttempts - 1);
    this.emit("error", {
      message: `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
    });
    this.reconnectTimer = setTimeout(() => {
      if (this.disposed || !this.url) return;
      // Re-enter connect() — it sets up a fresh socket + timeout.
      // We don't await here; events drive the state machine.
      void this.connect(this.url);
    }, delay);
  }

  private resubscribeAll(): void {
    if (this.desired.size === 0) return;
    // Re-issue subscribe requests for each desired type.
    for (const type of this.desired) {
      this.subscribe(type);
    }
  }

  private send(payload: JsonRpcRequest): void {
    if (!isOpen(this.ws)) {
      // Queueing is intentionally skipped: the connection-manager
      // treats a closed socket as a signal to fall back to polling.
      return;
    }
    try {
      this.ws?.send(JSON.stringify(payload));
    } catch (e) {
      this.emit("error", { message: `send() failed: ${String((e as Error)?.message ?? e)}` });
    }
  }

  private handleMessage(raw: unknown): void {
    let msg: WebSocketMessage;
    try {
      msg = JSON.parse(String(raw)) as WebSocketMessage;
    } catch {
      this.emit("error", { message: "Failed to parse WS message" });
      return;
    }

    // Subscription confirmation: { id, result: "0x..." }
    if ("id" in msg && "result" in msg && typeof msg.result === "string") {
      const type = this.pending.get(msg.id);
      if (type) {
        this.pending.delete(msg.id);
        this.active.set(msg.result, type);
        this.emit("subscribed", { subscriptionId: msg.result, type });
      }
      return;
    }

    // Streaming event: { method: "eth_subscription", params: {...} }
    if ("method" in msg && msg.method === "eth_subscription" && msg.params) {
      const { subscription, result } = msg.params;
      const data: BlockchainEvent = result as BlockchainEvent;
      this.emit("event", { subscription, data });
      return;
    }

    // Error response: { id, error: {...} }
    if ("error" in msg) {
      this.emit("error", {
        message: `RPC error ${msg.error.code}: ${msg.error.message}`,
      });
    }
  }

  private cleanupSocket(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.ws) {
      // Detach handlers so we don't double-fire during teardown.
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}
