# Robinhood Pair Tracker

Track **early / new pair tokens** on **Robinhood Chain (L2) Mainnet** by aggregating realtime public market data from:

| Source | Role | Keyless? |
|--------|------|----------|
| **GeckoTerminal** | New pools + trending pools on network `robinhood` (native Robinhood support) | ✅ |
| **DexScreener** | Token profiles, boosts, pair enrichment, search (`chainId=robinhood`) | ✅ |
| **Birdeye.so** | Trending + new listings tokens (Free Standard plan) | ⚠️ `BIRDEYE_API_KEY` |
| **CoinGecko** | Best-effort price/market-cap enrichment of Robinhood tokens (by symbol) | ✅ |
| **CoinMarketCap** | Best-effort price/market-cap enrichment of Robinhood tokens (by symbol, API key) | ⚠️ `COINMARKETCAP_API_KEY` |
| **DEXes** | Uniswap V2/V3/V4, PancakeSwap V2/V3, Bankr, Virtuals (via GeckoTerminal) | ✅ |

## Chain

| Property | Value |
|----------|--------|
| Name | Robinhood Chain |
| Chain ID | **4663** |
| Type | Arbitrum L2 (Ethereum) |
| Gas | ETH |
| DexScreener slug | `robinhood` |
| GeckoTerminal network | `robinhood` |

## Quick start

```bash
cd robinhood-pair-tracker
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- **New pairs** — GeckoTerminal `/networks/robinhood/new_pools`, merged with DexScreener profiles & boosts + Birdeye new listings
- **Trending** — GeckoTerminal trending pools + DexScreener + Birdeye, enriched with DexScreener, GeckoTerminal, CoinGecko & CoinMarketCap real-time data. **Every row is a Robinhood-chain token** — CoinGecko/CMC only enrich existing Robinhood rows by symbol; they never add global coins.
- **Boosts** — DexScreener latest/top boosts filtered to Robinhood
- **Search** — DexScreener + GeckoTerminal search, Robinhood pairs only
- **Filters** — max age, min liquidity, min volume, DEX
- **Adaptive auto-refresh** — the client polls at the fastest cadence among enabled sources; each source caches server-side at its own rate-limit-aware TTL (DexScreener 20s, GeckoTerminal/Birdeye 30s, CoinGecko 60s, CoinMarketCap 300s). The exact interval is returned per feed as `recommendedRefreshMs`.
- Per-row links: DexScreener, GeckoTerminal, CoinGecko, Birdeye, CoinMarketCap, copy address

## API routes (local proxy)

| Route | Description |
|-------|-------------|
| `GET /api/pairs/new` | Aggregated early/new pairs |
| `GET /api/pairs/trending` | Trending pools |
| `GET /api/pairs/boosts` | Boosted tokens |
| `GET /api/pairs/search?q=` | Search |
| `GET /api/stats` | Dashboard counters + DEX list |

## Notes

- Free public APIs have **rate limits**. Each source caches server-side at its own rate-limit-aware TTL (see `SOURCE_TIMING` in `lib/constants.ts`) and the client auto-refresh adapts to the fastest enabled source (`recommendedRefreshMs` in each feed).
- **CoinGecko** and **CoinMarketCap** are global aggregators that do **not** index Robinhood Chain on-chain tokens. They are used **only** to enrich existing Robinhood rows (price / market cap by symbol) — they never add non-Robinhood tokens to the feed. CoinMarketCap requires `COINMARKETCAP_API_KEY`.
- CoinMarketCap requires `COINMARKETCAP_API_KEY`; the source is silently skipped when unset.
- This is **not financial advice**. Memecoins and brand-new pairs are extremely high risk.

## Production

```bash
npm run build
npm start
```

## Environment Variables (Optional)

| Variable | Purpose | Example |
|----------|---------|---------|
| `BIRDEYE_API_KEY` | Birdeye API key (Standard free plan). Leave empty to disable. | `abc123...` |
| `BIRDEYE_CHAIN` | Birdeye chain | `robinhood` |
| `BIRDEYE_BASE_URL` | Birdeye base URL (default: `public-api.birdeye.so`) | `https://public-api.birdeye.so` |
| `COINMARKETCAP_API_KEY` | CoinMarketCap API key. Leave empty to disable the source. | `abc123...` |
| `COINGECKO_PLATFORM` | Optional CoinGecko on-chain platform id (Robinhood not indexed today) | `robinhood-chain` |
|