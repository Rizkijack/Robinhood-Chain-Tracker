/**
 * Tests for the SSE client.
 */

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

// @ts-ignore - Mock global EventSource
global.EventSource = MockEventSource as any;

describe("SSEClient", () => {
  let client: SSEClient;
  const testUrl = "https://ethereum.publicnode.com/sse";

  beforeEach(() => {
    client = new SSEClient({ url: testUrl });
  });

  afterEach(() => {
    client.disconnect();
  });

  test("should connect successfully", async () => {
    const connected = await client.connect();
    expect(connected).toBe(true);
    expect(client.isConnected).toBe(true);
  });

  test("should emit open event on connection", async () => {
    const openHandler = jest.fn();
    client.on("open", openHandler);
    
    await client.connect();
    
    expect(openHandler).toHaveBeenCalled();
  });

  test("should handle incoming messages", async () => {
    const messageHandler = jest.fn();
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

  test("should disconnect properly", async () => {
    await client.connect();
    expect(client.isConnected).toBe(true);
    
    client.disconnect();
    expect(client.isConnected).toBe(false);
  });

  test("should not connect twice", async () => {
    const result1 = await client.connect();
    const result2 = await client.connect();
    
    expect(result1).toBe(true);
    expect(result2).toBe(true);
  });
});
