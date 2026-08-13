/**
 * Unit tests for the SSEClient (Tier-2 streaming fallback).
 *
 * Uses a mock global EventSource (simulating async connection) so no real
 * network is needed. Runs in vitest's default `node` environment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SSEClient } from "../sse-client";

// Mock EventSource
class MockEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState: number = 0;
  url: string;

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.onopen?.();
    }, 10);
  }

  close() {
    this.readyState = 2; // CLOSED
  }
}

Object.defineProperty(MockEventSource, "CONNECTING", { value: 0 });
Object.defineProperty(MockEventSource, "OPEN", { value: 1 });
Object.defineProperty(MockEventSource, "CLOSED", { value: 2 });
MockEventSource.prototype.CONNECTING = 0;
MockEventSource.prototype.OPEN = 1;
MockEventSource.prototype.CLOSED = 2;

// @ts-ignore - Mock global EventSource
globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

describe("SSEClient", () => {
  let client: SSEClient;
  const testUrl = "https://ethereum.publicnode.com/sse";

  beforeEach(() => {
    client = new SSEClient({ url: testUrl });
  });

  afterEach(() => {
    client.disconnect();
  });

  it("should connect successfully", async () => {
    const connected = await client.connect();
    expect(connected).toBe(true);
    expect(client.isConnected).toBe(true);
  });

  it("should emit open event on connection", async () => {
    const openHandler = vi.fn();
    client.on("open", openHandler);

    await client.connect();

    expect(openHandler).toHaveBeenCalled();
  });

  it("should handle incoming messages", async () => {
    const messageHandler = vi.fn();
    client.on("message", messageHandler);

    await client.connect();

    // Simulate incoming message
    const mockEventSource = (client as any).eventSource;
    const testData = JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_subscription",
      params: {
        subscription: "0x123",
        result: { number: "0x123456" },
      },
    });

    mockEventSource.onmessage?.({ data: testData });

    expect(messageHandler).toHaveBeenCalled();
  });

  it("should disconnect properly", async () => {
    await client.connect();
    expect(client.isConnected).toBe(true);

    client.disconnect();
    expect(client.isConnected).toBe(false);
  });

  it("should not connect twice", async () => {
    const result1 = await client.connect();
    const result2 = await client.connect();

    expect(result1).toBe(true);
    expect(result2).toBe(true);
  });
});