# Robinhood Pair Tracker

Track early / new pair tokens on Robinhood Chain (L2) Mainnet. Aggregate realtime public market data from:

| Source | Role | Keyless? |
|--------|------|----------|
| **GeckoTerminal** | New + trending pools, network `robinhood` (native Robinhood support) | ✅ |
| **DexScreener** | Profiles, boosts, pair enrichment, search (`chainId=robinhood`) | ✅ |
| **Birdeye.so** | Trending + new listings (Free Standard plan) | ⚠️ `BIRDEYE_API_KEY` |
| **CoinGecko** | Best-effort price/market-cap enrich by symbol | ✅ |
| **CoinMarketCap** | Best-effort price/market-cap enrich by symbol, API key | ⚠️ `COINMARKETCAP_API_KEY` |
| **Launchpads** | lemon.fun, Bankr, Pools.trade, Sushi Launchpad, 01.exchange (public APIs) + Pons V1/V2, Flap, Trench, Bow, Bags (on-chain factory indexer) | ⚠️ `O1_EXCHANGE_API_KEY` (01.exchange only) |
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
- **Trending** — GeckoTerminal trending pools + DexScreener + Birdeye, enriched with DexScreener, GeckoTerminal, CoinGecko & CoinMarketCap real-time data. Every row = Robinhood-chain token — CoinGecko/CMC only enrich existing rows by symbol; never add global coins.
- **Boosts** — DexScreener latest/top boosts, Robinhood only
- **Search** — DexScreener + GeckoTerminal search, Robinhood pairs only
- **Launchpads** — tab aggregating launches from lemon.fun, Bankr, Pools.trade, Sushi Launchpad, 01.exchange (public APIs) + Pons V1/V2, Flap, Trench, Bow, Bags (on-chain factory indexer, cron refresh); phase filter (bonding/auction/graduated); graduated flow into Trending
- **Filters** — max age, min liquidity, min volume, DEX
- **Adaptive auto-refresh** — client polls fastest cadence among enabled sources; each source caches server-side at rate-limit-aware TTL (DexScreener 20s, GeckoTerminal/Birdeye 30s, CoinGecko 60s, CoinMarketCap 300s). Interval returned per feed as `recommendedRefreshMs`.
- Per-row links: DexScreener, GeckoTerminal, CoinGecko, Birdeye, CoinMarketCap, copy address

## API routes (local proxy)

| Route | Description |
|-------|-------------|
| `GET /api/pairs/new` | Aggregated early/new pairs |
| `GET /api/pairs/trending` | Trending pools |
| `GET /api/pairs/boosts` | Boosted tokens |
| `GET /api/pairs/search?q=` | Search |
| `GET /api/launchpads?phase=&limit=` | Aggregated launchpad tokens (phase filter: bonding/auction/graduated) |
| `GET /api/stats` | Dashboard counters + DEX list |

## Notes

- Free public APIs have rate limits. Each source caches server-side at rate-limit-aware TTL (see `SOURCE_TIMING` in `lib/constants.ts`); client auto-refresh adapts to fastest enabled source (`recommendedRefreshMs` per feed).
- **CoinGecko** + **CoinMarketCap** = global aggregators, do not index Robinhood Chain on-chain tokens. Used only to enrich existing Robinhood rows (price / market cap by symbol) — never add non-Robinhood tokens. CoinMarketCap requires `COINMARKETCAP_API_KEY`.
- CoinMarketCap requires `COINMARKETCAP_API_KEY`; source silently skipped when unset.
- Not financial advice. Memecoins + brand-new pairs = extreme risk.

## Wallet Connection

App supports multiple wallet connection providers:

### Setup
1. Copy `.env.example` to `.env.local`
2. Configure wallet provider IDs:
   - **Privy**: `NEXT_PUBLIC_PRIVY_APP_ID` (from [Privy Dashboard](https://dashboard.privy.io))
   - **Reown**: `NEXT_PUBLIC_REOWN_PROJECT_ID` (from [Reown Dashboard](https://reown.com/dashboard))
   - **WalletConnect**: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (optional)

### Features
- Connect external wallets (MetaMask, Rabby, WalletConnect) via Reown
- Connect embedded wallets (email, Google) via Privy
- Responsive UI with dropdown menu
- Copy address + view in explorer

For detailed setup, see [WALLET_SETUP.md](WALLET_SETUP.md).

## Production

```bash
npm run build
npm start
```

## Environment Variables (Optional)

| Variable | Purpose | Example |
|----------|---------|---------|
| `BIRDEYE_API_KEY` | Birdeye API key (Standard free plan). Empty = disable. | `abc123...` |
| `BIRDEYE_CHAIN` | Birdeye chain | `robinhood` |
| `BIRDEYE_BASE_URL` | Birdeye base URL (default: `public-api.birdeye.so`) | `https://public-api.birdeye.so` |
| `COINMARKETCAP_API_KEY` | CoinMarketCap API key. Empty = disable source. | `abc123...` |
| `COINGECKO_PLATFORM` | Optional CoinGecko on-chain platform id (Robinhood not indexed today) | `robinhood-chain` |
| `O1_EXCHANGE_API_KEY` | 01.exchange launchpad API key. Empty = disable source. | `abc123...` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy App ID for embedded wallets | `app_abc123...` |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | Reown Project ID for external wallets | `project_abc123...` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Project ID (optional) | `wc_abc123...` |
