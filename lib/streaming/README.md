# Blockchain Streaming Module

Fitur streaming murni dari blockchain node menggunakan WebSocket dan Server-Sent Events (SSE).

## 🚀 Fitur Utama

- **WebSocket Streaming**: Koneksi real-time langsung ke blockchain node menggunakan WebSocket (WSS)
- **SSE Streaming**: Alternatif menggunakan Server-Sent Events untuk kompatibilitas yang lebih luas
- **Automatic Fallback**: Jika WebSocket/SSE gagal, sistem otomatis fallback ke polling
- **Reconnection**: Reconnect otomatis dengan exponential backoff
- **Type-Safe**: TypeScript types lengkap untuk semua event dan konfigurasi
- **React Hooks**: Hook React siap pakai untuk integrasi mudah

## 📦 Komponen

### 1. WebSocket Client (`websocket-client.ts`)
Client WebSocket murni untuk subscription blockchain node.

**Fitur:**
- JSON-RPC 2.0 subscription helpers (`eth_subscribe` / `eth_unsubscribe`)
- Auto-reconnect dengan exponential backoff
- 3-second connection timeout
- Event emitter pattern

**Usage:**
```typescript
import { BlockchainWebSocketClient } from "./websocket-client";

const client = new BlockchainWebSocketClient({
  url: "wss://ethereum.publicnode.com",
  timeoutMs: 3000,
  maxReconnects: 3,
});

await client.connect();
client.subscribe("newHeads");
```

### 2. SSE Client (`sse-client.ts`)
Client SSE murni untuk blockchain node yang mendukung Server-Sent Events.

**Fitur:**
- Menggunakan native EventSource API
- Automatic reconnection
- Compatible dengan node yang mendukung SSE

**Usage:**
```typescript
import { SSEClient } from "./sse-client";

const client = new SSEClient({
  url: "https://ethereum.publicnode.com/sse",
  timeoutMs: 5000,
});

await client.connect();
```

### 3. Connection Manager (`connection-manager.ts`)
Orkestrator untuk sistem hybrid 3-tier.

**Tier:**
1. **WebSocket/SSE** - Real-time streaming (sub-second latency)
2. **Polling** - HTTP polling sebagai fallback

**Usage:**
```typescript
import { getConnectionManager } from "./connection-manager";

const manager = getConnectionManager();
manager.start("wss://...", "https://...sse");

manager.subscribe((snapshot) => {
  console.log("Connection status:", snapshot.status);
  console.log("Latest block:", snapshot.latestBlock);
});
```

### 4. React Hooks (`useBlockchainStream.ts`)
Hook React untuk integrasi mudah dengan UI.

**Usage:**
```typescript
import { useBlockchainStream } from "./useBlockchainStream";

function MyComponent() {
  const { snapshot, retry, stop, isConnected } = useBlockchainStream();
  
  return (
    <div>
      <p>Status: {snapshot.status}</p>
      <p>Method: {snapshot.method}</p>
      <button onClick={() => retry()}>Reconnect</button>
    </div>
  );
}
```

## 🔧 Konfigurasi

### Environment Variables

Tambahkan di `.env.local`:

```bash
# WebSocket URLs
NEXT_PUBLIC_ETH_WSS_URL=wss://ethereum.publicnode.com
NEXT_PUBLIC_POLYGON_WSS_URL=wss://polygon.publicnode.com
NEXT_PUBLIC_BSC_WSS_URL=wss://bsc.publicnode.com

# SSE URLs (jika didukung)
NEXT_PUBLIC_ETH_SSE_URL=https://ethereum.publicnode.com/sse
NEXT_PUBLIC_POLYGON_SSE_URL=https://polygon.publicnode.com/sse

# HTTP RPC URLs (untuk polling fallback)
NEXT_PUBLIC_ETH_RPC_URL=https://ethereum.publicnode.com
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon.publicnode.com
```

### Blockchain Node Presets

Gunakan preset yang sudah disediakan:

```typescript
import { BLOCKCHAIN_NODES } from "./connection-manager";

const ethConfig = BLOCKCHAIN_NODES.ethereum;
// { name: "Ethereum Mainnet", wsUrl: "...", chainId: 1, ... }
```

## 📝 Event Types

### Subscription Types
- `newHeads` - New block headers
- `logs` - Contract logs (memerlukan filter)
- `newPendingTransactions` - Pending transactions

### Connection Snapshot
```typescript
interface ConnectionSnapshot {
  status: "connecting" | "connected" | "reconnecting" | "error";
  method: "websocket" | "sse" | "polling";
  reason: string;
  latestBlock: string | null;
  latencyMs: number | null;
  lastEventAt: number | null;
  reconnectAttempts: number;
}
```

## 🎯 Best Practices

1. **Gunakan Connection Manager**: Jangan buat WebSocket/SSE connection langsung, gunakan manager untuk automatic fallback
2. **Environment Variables**: Simpan URL di environment variables, jangan hardcode
3. **Error Handling**: Selalu handle fallback ke polling mode
4. **Cleanup**: Panggil `stop()` saat component unmount
5. **Type Safety**: Manfaatkan TypeScript types yang sudah disediakan

## 🧪 Testing

Jalankan test:

```bash
npm test lib/streaming/__tests__/sse-client.test.ts
```

## 📚 Contoh Lengkap

Lihat `components/BlockchainStreamExample.tsx` untuk contoh implementasi lengkap dengan UI.

## 🔗 Resources

- [Ethereum JSON-RPC Spec](https://ethereum.org/en/developers/docs/apis/json-rpc/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)

## ⚠️ Catatan

- WebSocket dan SSE hanya berjalan di browser (client-side)
- Beberapa blockchain node mungkin tidak mendukung SSE
- Selalu sediakan fallback ke polling untuk reliability
- Perhatikan rate limiting pada public node
