# Design: Hybrid WebSocket Streaming dari Blockchain Node

**Date:** 2026-07-25
**Status:** Approved (pending implementation)
**Author:** Robinhood Tracker

## Ringkasan

Menambahkan koneksi streaming real-time murni dari blockchain node ke Robinhood Screener
menggunakan arsitektur **Hybrid 3-Tier Defense System**. Sistem mencoba WebSocket
terlebih dahulu (latency < 100ms), dan secara otomatis & silent fallback ke HTTP
polling yang sudah terbukti stabil jika WebSocket gagal (CORS, AdBlocker, VPN, atau
node mati).

## Konteks & Motivasi

### Status Quo
Aplikasi Robinhood Screener saat ini mengandalkan **HTTP polling** (`lib/background-refresh.ts`)
untuk memperbarui data feed pasangan token. Polling interval berkisar 20-30 detik
per source (DexScreener, Birdeye, GeckoTerminal).

### Masalah
- Latency tinggi: perubahan harga/pair baru membutuhkan waktu 20-30 detik untuk
  muncul di UI.
- Tidak ada notifikasi real-time untuk event blockchain (PairCreated, Swap, dst).
- Pengguna tidak bisa melihat pergerakan harga sub-detik.

### Solusi
Tambahkan WebSocket subscription ke Alchemy endpoint yang sudah terverifikasi
mendukung WSS, dengan fallback otomatis ke polling yang ada.

## Riset Endpoint (2026-07-25)

Diverifikasi langsung via Node.js WebSocket handshake:

| Endpoint | WSS Support | Hasil |
|----------|-------------|-------|
| `wss://robinhood-mainnet.g.alchemy.com/v2/...` | ✅ YES | `eth_subscribe` → `newHeads` berfungsi, menerima block updates tiap ~250ms |
| `wss://rpc.mainnet.chain.robinhood.com/ws` | ❌ NO | ERROR (connection failed) |
| `wss://rpc.mainnet.chain.robinhood.com` | ❌ NO | CLOSED (code 1000, "Normal Closure") |

**Kesimpulan:** Hanya Alchemy yang mendukung WebSocket untuk Robinhood Chain
(chain ID 4663). Robinhood public node hanya support HTTP RPC.

### Bukti Subscription
```json
// Request:
{"id":1,"jsonrpc":"2.0","method":"eth_subscribe","params":["newHeads"]}

// Response (subscription confirmed):
{"jsonrpc":"2.0","id":1,"result":"0xcadf7cfa54204bcddd7eb3ec83e19639"}

// Real-time events:
{"jsonrpc":"2.0","method":"eth_subscription","params":{
  "subscription":"0xcadf7cfa54204bcddd7eb3ec83e19639",
  "result":{"baseFeePerGas":"0x50e01a0","difficulty":"0x0",...}
}}
```

## Arsitektur: 3-Tier Hybrid Defense System

```
App Start
   │
   ▼
┌─────────────────────────────────┐
│  Tier 1: WebSocket (Primary)    │
│  - NEXT_PUBLIC_WSS_URL         │
│  - Timeout: 3 seconds          │
│  - Sub-second latency           │
└────────┬────────────────────────┘
         │
    ┌────▼────┐
    │ Success?│
    └────┬────┘
         │
    YES  │  NO (onError/onClose/timeout)
         │         │
         ▼         ▼
   [Stream WS]  ┌──────────────────────────┐
   Active       │ Silent Fallback           │
   (< 100ms)    │ to HTTP Polling (Tier 3)  │
                │ - No UI interruption      │
                │ - Reuse existing system  │
                └──────────────────────────┘
```

### Tier 2 (SSE) Sengaja Dilewati untuk MVP
Alasan:
1. Tier 3 (polling) sudah 100% stabil dan teruji di project ini.
2. Mengurangi complexity untuk MVP pertama.
3. SSE bisa ditambahkan sebagai enhancement Phase 2 di kemudian hari.

## Komponen yang Akan Dibuat

### 1. `lib/streaming/types.ts`
TypeScript types untuk streaming system:
- `ConnectionMethod = 'websocket' | 'polling'`
- `ConnectionStatus = 'connecting' | 'connected' | 'fallback' | 'error'`
- `BlockchainEvent` (newHeads, logs, dll)
- `SubscriptionType = 'newHeads' | 'logs' | 'newPendingTransactions'`

### 2. `lib/streaming/websocket-client.ts`
Pure WebSocket client (framework-agnostic):
- 3-second timeout untuk koneksi awal
- Auto-reconnect dengan exponential backoff (1s, 2s, 4s, 8s, max 30s)
- JSON-RPC 2.0 subscription helpers (`eth_subscribe`/`eth_unsubscribe`)
- Event emitter pattern untuk message/connection events
- Silent failure (tidak throw, hanya emit error event)

### 3. `lib/streaming/connection-manager.ts`
Orchestrator yang mengatur 3-tier fallback:
- State machine: `connecting → connected(websocket) | fallback(polling)`
- Coba WS dulu, fallback ke polling jika gagal dalam 3s
- Monitor WS health: jika drop, bisa coba reconnect atau fallback
- Expose single API: `connect()`, `disconnect()`, `onEvent()`

### 4. `hooks/useBlockchainStream.ts`
React hook (public API untuk komponen):
- Menggunakan connection-manager
- Auto-cleanup on unmount
- Expose: `connectionMethod`, `isConnected`, `events`, `latestBlock`
- Integrasi dengan Zustand stores (feed-store, notification-store)

### 5. `hooks/useConnectionStatus.ts`
Hook untuk connection status indicator:
- Expose status LED state: `websocket` (green), `polling` (yellow), `error` (red)
- Toast notification saat method berubah (optional, bisa di-toggle)

### 6. `components/ConnectionStatus.tsx`
UI component untuk display connection method:
- Small LED indicator (atas-kanan header, atau di sidebar)
- Tooltip: "Real-time via WebSocket" / "Polling (fallback)"
- Color-coded: green (WS), yellow (polling), gray (connecting)

### 7. `lib/streaming/__tests__/websocket-client.test.ts`
Unit tests untuk WebSocket client:
- 3s timeout behavior
- Reconnect logic
- JSON-RPC subscription flow
- Silent failure handling

## Integrasi dengan Sistem Existing

### TrackerApp.tsx (modifikasi)
```typescript
function TrackerApp() {
  const { connectionMethod, latestBlock } = useBlockchainStream();

  // Connection status indicator
  // (polling tetap berjalan di background via existing hooks)

  return (
    <>
      <ConnectionStatus method={connectionMethod} />
      {/* Existing UI components unchanged */}
    </>
  );
}
```

### Notification Store (existing, sudah ada)
- `notification-store.ts` sudah punya `addToast()`
- Akan digunakan untuk "connection changed" notifications (optional)

### Feed Store (existing)
- WS events akan **menambah** (tidak menggantikan) data dari polling
- WS untuk real-time price ticks & block notifications
- Polling tetap jadi source of truth untuk pair list & metadata

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_WSS_URL=wss://robinhood-mainnet.g.alchemy.com/v2/qJtfjLqzeQL2yJ5NFXDjHNhtlyxwZyrD
```

Jika `NEXT_PUBLIC_WSS_URL` kosong/undefined → langsung skip ke polling (Tier 3).

## Error Handling

### WebSocket Failure Scenarios
1. **Timeout (3s)** → fallback to polling, no error shown
2. **onError** → fallback to polling, no error shown
3. **onClose (mid-stream)** → attempt reconnect (3x), then fallback to polling
4. **Network drop** → reconnect attempt, polling continues in parallel

### Reconnection Strategy
- Max 3 reconnect attempts
- Exponential backoff: 1s → 2s → 4s
- Setelah 3x gagal → permanent fallback to polling
- User dapat manually retry via "Refresh" button (optional)

## Testing Strategy

### Unit Tests (vitest)
- `websocket-client.ts`: timeout, reconnect, subscription lifecycle
- `connection-manager.ts`: state transitions, fallback logic

### Integration Tests
- Mock WebSocket server (gunakan `ws` package di test env)
- Verify fallback terjadi dalam < 3s saat WS gagal

### Manual Testing
- **Scenario 1:** WSS URL valid → WebSocket connects, real-time events flow
- **Scenario 2:** WSS URL invalid → silent fallback to polling dalam 3s
- **Scenario 3:** WSS URL kosong → langsung polling
- **Scenario 4:** AdBlocker aktif → fallback to polling
- **Scenario 5:** VPN dengan WSS blocked → fallback to polling
- **Scenario 6:** Network drop mid-stream → reconnect attempt, polling continues

## Performance Targets

| Metric | Target | Method |
|--------|--------|--------|
| WS Connection Time | < 3s | 3s timeout hard limit |
| WS Event Latency | < 100ms | Direct Alchemy WSS |
| Polling Interval | 20-30s | Existing (unchanged) |
| Silent Fallback Time | < 100ms | No UI blocking |
| Bundle Size Impact | < 5KB | No new heavy deps |

## Out of Scope (Phase 2)

- SSE layer (Tier 2) - bisa ditambahkan nanti
- Server-side event aggregation via Upstash Redis PubSub
- WebSocket proxy via Next.js API route (untuk auth/secret keys)
- Subscription ke contract-specific logs (PairCreated, Swap) - butuh ABI & address
- Multi-chain support (currently Robinhood Chain only)

## File Structure

```
lib/
├── streaming/
│   ├── types.ts                    # NEW
│   ├── websocket-client.ts         # NEW
│   ├── connection-manager.ts       # NEW
│   └── __tests__/
│       └── websocket-client.test.ts # NEW
hooks/
├── useBlockchainStream.ts          # NEW
└── useConnectionStatus.ts          # NEW
components/
└── ConnectionStatus.tsx            # NEW
app/
└── (no new API routes for MVP)

Modified:
- .env.example                      # Add NEXT_PUBLIC_WSS_URL
- components/TrackerApp.tsx          # Integrate ConnectionStatus
- lib/store/index.ts                # (no changes needed)
```
