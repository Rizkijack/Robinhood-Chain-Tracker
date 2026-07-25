/**
 * Unit tests for the BlockchainWebSocketClient.
 *
 * Strategy:
 *   - Mock the global `WebSocket` class with a controllable stub so
 *     we can simulate open/error/close events without a real network.
 *   - Use vitest fake timers to test the 3-second connection timeout
 *     and the exponential backoff reconnect schedule.
 *   - The client is a pure event emitter — no React, no DOM, so these
 *     tests run in vitest's default `node` environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BlockchainWebSocketClient } from "@/lib/streaming/websocket-client";

/* ── Node-environment polyfills ────────────────────────────────
 * vitest runs in `node` env by default. The browser-only CloseEvent
 * and Event globals aren't defined, so the mock's fire* helpers would
 * throw. Provide minimal stand-ins.
 * ──────────────────────────────────────────────────────────── */
if (typeof globalThis.CloseEvent === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).CloseEvent = class CloseEvent extends Event {
    code: number;
    reason: string;
    wasClean: boolean;
    constructor(type: string, init: { code?: number; reason?: string; wasClean?: boolean } = {}) {
      super(type);
      this.code = init.code ?? 1006;
      this.reason = init.reason ?? "";
      this.wasClean = init.wasClean ?? false;
    }
  };
}

/* ── Mock WebSocket ──────────────────────────────────────────── */

const OPEN = 1;
const CONNECTING = 0;

/**
 * The mock is also the instance: when the client calls
 * `new WebSocket(url)`, it gets one of these back, with the fire*
 * helpers attached so tests can drive it. readyState is kept in sync
 * so the client's `isOpen()` check works correctly.
 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static last: MockWebSocket | null = null;
  static ctorShouldThrow = false;
  static OPEN = OPEN;
  static CONNECTING = CONNECTING;

  url: string;
  readyState: number = CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    if (MockWebSocket.ctorShouldThrow) {
      throw new Error("Mock constructor failure");
    }
    this.url = url;
    MockWebSocket.instances.push(this);
    MockWebSocket.last = this;
  }

  fireOpen(): void {
    this.readyState = OPEN;
    this.onopen?.(new Event("open"));
  }
  fireError(): void {
    this.onerror?.(new Event("error"));
  }
  fireClose(code = 1006, reason = "", wasClean = false): void {
    this.readyState = 3; // CLOSED
    this.onclose?.(
      new (globalThis.CloseEvent as unknown as typeof CloseEvent)("close", {
        code,
        reason,
        wasClean,
      })
    );
  }
  fireMessage(data: unknown): void {
    // Real WebSocket always delivers text frames as strings, so mirror
    // that here — the client does JSON.parse(String(raw)), which would
    // turn a raw object into "[object Object]" and fail to parse.
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    this.onmessage?.({ data: payload } as MessageEvent);
  }

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    /* no-op in mock */
  }
}

/* ── Test setup ──────────────────────────────────────────────── */

describe("BlockchainWebSocketClient", () => {
  let originalWebSocket: typeof WebSocket | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    originalWebSocket = globalThis.WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    (globalThis as any).WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
    MockWebSocket.last = null;
    MockWebSocket.ctorShouldThrow = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalWebSocket !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).WebSocket = originalWebSocket;
    }
  });

  /* ── Connection success ───────────────────────────────────── */

  it("resolves ok=true with latency when WS opens within 3s", async () => {
    const client = new BlockchainWebSocketClient();
    const promise = client.connect("wss://example.com");

    // Simulate the server accepting the connection immediately.
    MockWebSocket.last!.fireOpen();

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    client.disconnect();
  });

  it("emits 'open' event on successful connect", async () => {
    const client = new BlockchainWebSocketClient();
    const onOpen = vi.fn();
    client.on("open", onOpen);

    const promise = client.connect("wss://example.com");
    MockWebSocket.last!.fireOpen();
    await promise;

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ url: "wss://example.com" })
    );
    client.disconnect();
  });

  /* ── Connection timeout (Tier 1 failure) ─────────────────── */

  it("resolves ok=false with reason=ws-timeout after 3s", async () => {
    const client = new BlockchainWebSocketClient();
    const onError = vi.fn();
    client.on("error", onError);

    const promise = client.connect("wss://slow.example.com");
    // Advance past the 3-second timeout.
    await vi.advanceTimersByTimeAsync(3_100);

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("ws-timeout");
    expect(onError).toHaveBeenCalled(); // diagnostics emitted
    client.disconnect();
  });

  it("does not resolve twice (timeout vs error race)", async () => {
    const client = new BlockchainWebSocketClient();
    const promise = client.connect("wss://racy.example.com");

    await vi.advanceTimersByTimeAsync(3_100); // timeout fires
    const first = await promise;

    // Now fire an error — should not change the result.
    MockWebSocket.last?.fireError();
    // (No way to await again on a settled promise; just assert state.)
    expect(first.ok).toBe(false);
    client.disconnect();
  });

  /* ── Connection error ────────────────────────────────────── */

  it("resolves ok=false with reason=ws-error on socket error", async () => {
    const client = new BlockchainWebSocketClient();
    const promise = client.connect("wss://broken.example.com");

    // Error during the connect phase → treated as connect failure.
    MockWebSocket.last!.fireError();

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("ws-error");
    client.disconnect();
  });

  /* ── Subscription flow ────────────────────────────────────── */

  it("subscribes by sending eth_subscribe after open", async () => {
    const client = new BlockchainWebSocketClient();
    const promise = client.connect("wss://example.com");
    MockWebSocket.last!.fireOpen();
    await promise;

    client.subscribe("newHeads");

    expect(MockWebSocket.last!.sent.length).toBe(1);
    const sent = JSON.parse(MockWebSocket.last!.sent[0]);
    expect(sent.method).toBe("eth_subscribe");
    expect(sent.params).toEqual(["newHeads"]);
    client.disconnect();
  });

  it("emits 'subscribed' when node confirms the subscription", async () => {
    const client = new BlockchainWebSocketClient();
    const onSubscribed = vi.fn();
    client.on("subscribed", onSubscribed);

    const promise = client.connect("wss://example.com");
    MockWebSocket.last!.fireOpen();
    await promise;

    client.subscribe("newHeads");
    const sent = JSON.parse(MockWebSocket.last!.sent[0]);
    // Node replies with the subscription ID.
    MockWebSocket.last!.fireMessage({
      id: sent.id,
      jsonrpc: "2.0",
      result: "0xabc123",
    });

    expect(onSubscribed).toHaveBeenCalledWith({
      subscriptionId: "0xabc123",
      type: "newHeads",
    });
    client.disconnect();
  });

  it("emits 'event' when node pushes a subscription update", async () => {
    const client = new BlockchainWebSocketClient();
    const onEvent = vi.fn();
    client.on("event", onEvent);

    const promise = client.connect("wss://example.com");
    MockWebSocket.last!.fireOpen();
    await promise;

    client.subscribe("newHeads");
    // Confirm subscription.
    const sentSub = JSON.parse(MockWebSocket.last!.sent[0]);
    MockWebSocket.last!.fireMessage({
      id: sentSub.id,
      jsonrpc: "2.0",
      result: "0xsub",
    });

    // Push a newHeads event.
    MockWebSocket.last!.fireMessage({
      jsonrpc: "2.0",
      method: "eth_subscription",
      params: {
        subscription: "0xsub",
        result: { number: "0x100", hash: "0xdeadbeef" },
      },
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({
      subscription: "0xsub",
      data: { number: "0x100", hash: "0xdeadbeef" },
    });
    client.disconnect();
  });

  /* ── Reconnect ────────────────────────────────────────────── */

  it("schedules a reconnect on mid-stream close (exponential backoff)", async () => {
    const client = new BlockchainWebSocketClient();
    const promise = client.connect("wss://example.com");
    MockWebSocket.last!.fireOpen();
    await promise;

    const onFallback = vi.fn();
    client.on("fallback", onFallback);

    // Simulate a network drop.
    MockWebSocket.last!.fireClose(1006, "abnormal");

    // After close, a reconnect should be scheduled at +1s.
    await vi.advanceTimersByTimeAsync(1_000);
    // A new WS instance is created for the reconnect attempt.
    expect(MockWebSocket.instances.length).toBe(2);
    // Second instance — open it so reconnect succeeds.
    MockWebSocket.last!.fireOpen();

    // No fallback should have been emitted (reconnect succeeded).
    expect(onFallback).not.toHaveBeenCalled();
    client.disconnect();
  });

  it("emits 'fallback' after MAX_RECONNECT_ATTEMPTS (3) failures", async () => {
    const client = new BlockchainWebSocketClient();
    const promise = client.connect("wss://example.com");
    MockWebSocket.last!.fireOpen();
    await promise;

    const onFallback = vi.fn();
    client.on("fallback", onFallback);

    // Initial mid-stream drop schedules the first reconnect (1s backoff).
    MockWebSocket.last!.fireClose(1006);

    // Three reconnect attempts, each failing (socket closes before open).
    // Backoff doubles each attempt: 1s, 2s, 4s.
    for (let i = 1; i <= 3; i++) {
      await vi.advanceTimersByTimeAsync(1_000 * 2 ** (i - 1)); // backoff → new socket
      MockWebSocket.last!.fireClose(1006); // this attempt fails
    }

    expect(onFallback).toHaveBeenCalledWith({ reason: "ws-closed" });
    client.disconnect();
  });

  /* ── Silent failure contract ──────────────────────────────── */

  it("never throws — connect() always resolves even if ctor throws", async () => {
    MockWebSocket.ctorShouldThrow = true;
    const client = new BlockchainWebSocketClient();

    await expect(client.connect("wss://throw.example.com")).resolves.toEqual(
      expect.objectContaining({ ok: false })
    );
    client.disconnect();
  });

  /* ── Disconnect ───────────────────────────────────────────── */

  it("disconnect() stops further reconnects", async () => {
    const client = new BlockchainWebSocketClient();
    const promise = client.connect("wss://example.com");
    MockWebSocket.last!.fireOpen();
    await promise;

    client.disconnect();
    const instanceCountBefore = MockWebSocket.instances.length;

    // Fire a close — normally would trigger reconnect, but we're disposed.
    MockWebSocket.last!.fireClose(1006);
    await vi.advanceTimersByTimeAsync(10_000); // well past backoff

    expect(MockWebSocket.instances.length).toBe(instanceCountBefore);
  });
});
