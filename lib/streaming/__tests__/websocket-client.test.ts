/**
 * Unit tests for BlockchainWebSocketClient.
 *
 * These tests use a mock WebSocket implementation to verify:
 * - 3-second connection timeout
 * - Auto-reconnect with exponential backoff
 * - JSON-RPC subscription flow (eth_subscribe / eth_unsubscribe)
 * - Silent failure (no thrown errors)
 * - Event emission for open, message, error, close, fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BlockchainWebSocketClient } from "../websocket-client";

// ── Mock WebSocket ───────────────────────────────────────────────

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;

  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  static instances: MockWebSocket[] = [];

  // Test helpers to simulate browser events
  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  triggerMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }

  triggerError() {
    this.onerror?.({} as Event);
  }

  triggerClose(code: number, reason: string, wasClean = true) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean } as CloseEvent);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

// Mock global WebSocket safely for testing
(globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;

// ── Tests ────────────────────────────────────────────────────────

describe("BlockchainWebSocketClient", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("connect", () => {
    it("should connect successfully when WebSocket opens", async () => {
      const client = new BlockchainWebSocketClient();

      const connectPromise = client.connect("wss://test.example.com/ws");

      // Simulate WebSocket opening
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      const result = await connectPromise;
      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(client.isConnected).toBe(true);
    });

    it("should return false when connection times out (3s)", async () => {
      const client = new BlockchainWebSocketClient();

      const connectPromise = client.connect("wss://test.example.com/ws");

      // Advance time past the 3s timeout
      vi.advanceTimersByTime(3000);

      const result = await connectPromise;
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("ws-timeout");
    });

    it("should return false when WebSocket errors during connect", async () => {
      const client = new BlockchainWebSocketClient();

      const connectPromise = client.connect("wss://test.example.com/ws");

      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerError();
      mockWs.triggerClose(1006, "Connection failed");

      const result = await connectPromise;
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("ws-error");
    });

    it("should resolve immediately if already connected to same URL", async () => {
      const client = new BlockchainWebSocketClient();

      // First connect
      const connectPromise1 = client.connect("wss://test.example.com/ws");
      MockWebSocket.instances[0].triggerOpen();
      await connectPromise1;

      // Second connect to same URL
      const result = await client.connect("wss://test.example.com/ws");
      expect(result.ok).toBe(true);
      expect(MockWebSocket.instances).toHaveLength(1); // No new socket
    });
  });

  describe("subscribe", () => {
    it("should send eth_subscribe message when connected", async () => {
      const client = new BlockchainWebSocketClient();

      await client.connect("wss://test.example.com/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      const subId = client.subscribe("newHeads");
      expect(subId).toBe(1); // First request ID

      // Verify the sent message
      const sentMsg = JSON.parse(mockWs.sentMessages[0]);
      expect(sentMsg.method).toBe("eth_subscribe");
      expect(sentMsg.params).toContain("newHeads");
      expect(sentMsg.jsonrpc).toBe("2.0");
    });

    it("should handle subscription confirmation from node", async () => {
      const client = new BlockchainWebSocketClient();

      const subscribedHandler = vi.fn();
      client.on("subscribed", subscribedHandler);

      await client.connect("wss://test.example.com/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      client.subscribe("newHeads");

      // Simulate subscription confirmation
      mockWs.triggerMessage(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: "0xabc123",
        })
      );

      expect(subscribedHandler).toHaveBeenCalledWith({
        subscriptionId: "0xabc123",
        type: "newHeads",
      });
    });

    it("should emit blockchain events from node", async () => {
      const client = new BlockchainWebSocketClient();

      const eventHandler = vi.fn();
      client.on("event", eventHandler);

      await client.connect("wss://test.example.com/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      client.subscribe("newHeads");

      // Simulate subscription confirmation
      mockWs.triggerMessage(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0xabc123" })
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

      expect(eventHandler).toHaveBeenCalledWith({
        subscription: "0xabc123",
        data: { number: "0x1234", hash: "0xabcdef" },
      });
    });
  });

  describe("unsubscribe", () => {
    it("should send eth_unsubscribe message", async () => {
      const client = new BlockchainWebSocketClient();

      await client.connect("wss://test.example.com/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      client.subscribe("newHeads");
      client.unsubscribe("newHeads");

      // Find the unsubscribe message
      const unsubMsg = mockWs.sentMessages.find((m) =>
        JSON.parse(m).method === "eth_unsubscribe"
      );
      expect(unsubMsg).toBeDefined();
      const parsed = JSON.parse(unsubMsg!);
      expect(parsed.method).toBe("eth_unsubscribe");
    });
  });

  describe("reconnect", () => {
    it("should attempt reconnect on mid-stream disconnect", async () => {
      const client = new BlockchainWebSocketClient();

      const connectPromise = client.connect("wss://test.example.com/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();
      await connectPromise;

      // Simulate disconnect after connection
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

    it("should emit fallback after max reconnect attempts", async () => {
      const client = new BlockchainWebSocketClient();

      const fallbackHandler = vi.fn();
      client.on("fallback", fallbackHandler);

      const connectPromise = client.connect("wss://test.example.com/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();
      await connectPromise;

      // Simulate disconnect
      mockWs.triggerClose(1006, "Network error");

      // Advance through all reconnect attempts:
      // Attempt 1: 1s
      vi.advanceTimersByTime(1000);
      MockWebSocket.instances[1].triggerError();
      MockWebSocket.instances[1].triggerClose(1006, "Failed");

      // Attempt 2: 2s
      vi.advanceTimersByTime(2000);
      MockWebSocket.instances[2].triggerError();
      MockWebSocket.instances[2].triggerClose(1006, "Failed");

      // Attempt 3: 4s
      vi.advanceTimersByTime(4000);
      MockWebSocket.instances[3].triggerError();
      MockWebSocket.instances[3].triggerClose(1006, "Failed");

      // Should have emitted fallback
      expect(fallbackHandler).toHaveBeenCalledWith({ reason: "ws-closed" });
    });

    it("should use exponential backoff (1s, 2s, 4s)", async () => {
      const client = new BlockchainWebSocketClient();

      const connectPromise = client.connect("wss://test.example.com/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();
      await connectPromise;

      // Disconnect
      mockWs.triggerClose(1006, "Network error");

      // Attempt 1 should be at 1s
      vi.advanceTimersByTime(999);
      expect(MockWebSocket.instances).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(2);

      // Attempt 2 should be at 2s
      vi.advanceTimersByTime(1999);
      expect(MockWebSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(3);

      // Attempt 3 should be at 4s
      vi.advanceTimersByTime(3999);
      expect(MockWebSocket.instances).toHaveLength(3);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(4);
    });
  });

  describe("disconnect", () => {
    it("should clean up resources on disconnect", async () => {
      const client = new BlockchainWebSocketClient();

      await client.connect("wss://test.example.com/ws");
      client.disconnect();

      expect(client.isConnected).toBe(false);
    });

    it("should prevent reconnect after disconnect", async () => {
      const client = new BlockchainWebSocketClient();

      await client.connect("wss://test.example.com/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      client.disconnect();

      // Simulate disconnect after cleanup
      mockWs.triggerClose(1006, "Normal closure");

      // Should not reconnect
      vi.advanceTimersByTime(10000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe("error handling", () => {
    it("should not throw on invalid JSON message", async () => {
      const client = new BlockchainWebSocketClient();

      const errorHandler = vi.fn();
      client.on("error", errorHandler);

      await client.connect("wss://test.example.com/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      // Send invalid JSON
      expect(() => {
        mockWs.triggerMessage("not valid json");
      }).not.toThrow();

      expect(errorHandler).toHaveBeenCalledWith({
        message: "Failed to parse WS message",
      });
    });

    it("should handle RPC error responses", async () => {
      const client = new BlockchainWebSocketClient();

      const errorHandler = vi.fn();
      client.on("error", errorHandler);

      await client.connect("wss://test.example.com/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.triggerOpen();

      // Send RPC error
      mockWs.triggerMessage(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32000, message: "subscription failed" },
        })
      );

      expect(errorHandler).toHaveBeenCalledWith({
        message: "RPC error -32000: subscription failed",
      });
    });
  });
});
