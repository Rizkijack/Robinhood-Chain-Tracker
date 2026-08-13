/**
 * Simple test script for streaming clients.
 * Run with: node test-streaming.js
 */

// Mock EventSource for Node.js environment
global.EventSource = class MockEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    
    // Simulate connection
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) this.onopen();
    }, 100);
  }
  
  close() {
    this.readyState = 2;
  }
};

// Mock WebSocket for Node.js environment
global.WebSocket = class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) this.onopen();
    }, 100);
  }
  
  send(data) {
    console.log("WebSocket send:", data);
  }
  
  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose({ code: 1000, reason: "test" });
  }
};

// Import after mocks
const { SSEClient } = require("./lib/streaming/sse-client");
const { BlockchainWebSocketClient } = require("./lib/streaming/websocket-client");

async function testSSEClient() {
  console.log("\n=== Testing SSE Client ===\n");
  
  const client = new SSEClient({
    url: "https://ethereum.publicnode.com/sse",
    timeoutMs: 5000,
  });
  
  client.on("open", () => {
    console.log("✓ SSE connected");
  });
  
  client.on("message", (data) => {
    console.log("✓ SSE message received:", data);
  });
  
  client.on("error", (err) => {
    console.log("✗ SSE error:", err.message);
  });
  
  const connected = await client.connect();
  console.log("Connection result:", connected);
  
  setTimeout(() => {
    client.disconnect();
    console.log("✓ SSE disconnected");
  }, 2000);
}

async function testWebSocketClient() {
  console.log("\n=== Testing WebSocket Client ===\n");
  
  const client = new BlockchainWebSocketClient();
  
  client.on("open", ({ latencyMs }) => {
    console.log("✓ WebSocket connected, latency:", latencyMs, "ms");
  });
  
  client.on("event", ({ data }) => {
    console.log("✓ WebSocket event:", data);
  });
  
  const result = await client.connect("wss://ethereum.publicnode.com");
  console.log("Connection result:", result);
  
  setTimeout(() => {
    client.disconnect();
    console.log("✓ WebSocket disconnected");
  }, 2000);
}

// Run tests
(async () => {
  console.log("Starting streaming client tests...\n");
  
  try {
    await testSSEClient();
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await testWebSocketClient();
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log("\n=== All tests completed ===\n");
    process.exit(0);
  } catch (err) {
    console.error("Test error:", err);
    process.exit(1);
  }
})();
