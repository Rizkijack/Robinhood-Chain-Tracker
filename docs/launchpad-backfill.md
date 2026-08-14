# Launchpad On-Chain Backfill

Backfill script untuk on-chain launchpad indexer (Pons V1/V2, Flap, Trench, Bow, Bags) di Robinhood Chain.

## Kenapa perlu

Indexer on-chain membaca `TokenLaunched`/`TokenCreated` events dari factory contracts. Karena Vercel Hobby cuma izinkan cron 1x/hari + timeout 30s, indexer hanya maju ~3.000 block per run — **tidak cukup untuk backfill historis** dari block deploy (~7.5M–9M) ke head (~36M).

Script ini menjalankan backfill **sekali** di mesin lokal: scan semua factory dari deploy block ke head, decode token, simpan cursor + index ke Upstash Redis. Setelah itu cron Vercel tinggal maju 3k block/hari untuk token baru.

## Prasyarat

1. **Upstash Redis** (free tier cukup):
   - Buat DB di https://upstash.com → REST URL + REST Token
   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

2. Pasang credentials:
   ```bash
   # lokal (backfill)
   # tambahkan ke .env.local:
   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN=xxx
   ```
   Juga tambahkan di **Vercel** (Settings → Environment Variables → Production) supaya cron bisa baca index.

## Jalankan backfill

```bash
# dari root project, setelah npm install
UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node scripts/launchpad-backfill.mjs
```

Butuh waktu 30–60 menit (ribuan RPC calls, ada rate-limit pause tiap chunk). Bisa dijalankan per platform:

```bash
# satu platform saja
node scripts/launchpad-backfill.mjs --platform=pons
```

Opsi:
| Flag | Fungsi |
|------|--------|
| `--platform=<id>` | Backfill satu platform saja (pons, ponsv2, flap, trench, bow, bags) |
| `--chunk=<n>` | Blocks per eth_getLogs call (default 2000) |
| `--dry-run` | Scan tanpa menulis ke Redis |

## Setelah backfill

1. Deploy ke Vercel (biar env `UPSTASH_*` aktif)
2. Cron harian `0 9 * * *` otomatis refresh index (baca cursor, scan 3k block baru, update index di Redis, TTL 6 jam)
3. Tab Launchpad di UI baca `/api/launchpads` → aggregator baca index dari Redis

## Verifikasi

```bash
# cek index tersimpan
curl -s "https://robinhoodscreener.vercel.app/api/launchpads?phase=all" | head -c 500
```

Token dari Pons/Bow/Flap/Trench/Bags seharusnya muncul dengan `platform` sesuai factory-nya.
