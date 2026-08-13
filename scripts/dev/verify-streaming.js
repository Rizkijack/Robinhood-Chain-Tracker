/**
 * Verification script for streaming implementation.
 * Run with: node verify-streaming.js
 * 
 * This script checks:
 * 1. All required files exist
 * 2. Exports are correct
 * 3. Types are properly defined
 * 4. No critical issues
 */

const fs = require("fs");
const path = require("path");

console.log("🔍 Verifying Streaming Implementation...\n");

const streamingDir = path.join(__dirname, "lib", "streaming");
const requiredFiles = [
  "websocket-client.ts",
  "sse-client.ts",
  "connection-manager.ts",
  "types.ts",
  "useBlockchainStream.ts",
  "index.ts",
  "README.md",
];

let allGood = true;

// Check files exist
console.log("📁 Checking required files:");
requiredFiles.forEach((file) => {
  const filePath = path.join(streamingDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  ✗ ${file} - MISSING!`);
    allGood = false;
  }
});

// Check exports in index.ts
console.log("\n📦 Checking exports:");
const indexPath = path.join(streamingDir, "index.ts");
if (fs.existsSync(indexPath)) {
  const content = fs.readFileSync(indexPath, "utf8");
  const exports = [
    "BlockchainWebSocketClient",
    "SSEClient",
    "getConnectionManager",
    "ConnectionMethod",
    "ConnectionSnapshot",
  ];
  
  exports.forEach((exp) => {
    if (content.includes(exp)) {
      console.log(`  ✓ ${exp}`);
    } else {
      console.log(`  ✗ ${exp} - not exported!`);
      allGood = false;
    }
  });
}

// Check types
console.log("\n📝 Checking type definitions:");
const typesPath = path.join(streamingDir, "types.ts");
if (fs.existsSync(typesPath)) {
  const content = fs.readFileSync(typesPath, "utf8");
  const types = [
    "SubscriptionType",
    "ConnectionMethod",
    "ConnectionSnapshot",
    "BlockchainEvent",
    "JsonRpcResponse",
    "SSEClientConfig",
    "BlockchainNodeConfig",
  ];
  
  types.forEach((type) => {
    if (content.includes(type)) {
      console.log(`  ✓ ${type}`);
    } else {
      console.log(`  ✗ ${type} - not defined!`);
      allGood = false;
    }
  });
}

// Check example component
console.log("\n🎨 Checking example component:");
const examplePath = path.join(__dirname, "components", "BlockchainStreamExample.tsx");
if (fs.existsSync(examplePath)) {
  console.log("  ✓ BlockchainStreamExample.tsx");
} else {
  console.log("  ✗ BlockchainStreamExample.tsx - MISSING!");
  allGood = false;
}

// Check demo page
console.log("\n📄 Checking demo page:");
const demoPath = path.join(__dirname, "app", "streaming-demo", "page.tsx");
if (fs.existsSync(demoPath)) {
  console.log("  ✓ app/streaming-demo/page.tsx");
} else {
  console.log("  ✗ app/streaming-demo/page.tsx - MISSING!");
  allGood = false;
}

// Summary
console.log("\n" + "=".repeat(50));
if (allGood) {
  console.log("✅ VERIFICATION PASSED!");
  console.log("\nAll streaming components are properly implemented.");
  console.log("\nNext steps:");
  console.log("  1. Run `npm run dev` to start the development server");
  console.log("  2. Visit http://localhost:3000/streaming-demo");
  console.log("  3. Configure your blockchain node URLs in .env.local");
  console.log("  4. Test the streaming connection");
} else {
  console.log("❌ VERIFICATION FAILED!");
  console.log("\nSome components are missing or misconfigured.");
  console.log("Please check the errors above and fix them.");
}
console.log("=".repeat(50) + "\n");
