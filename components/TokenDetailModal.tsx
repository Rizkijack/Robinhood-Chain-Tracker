"use client";

import { useEffect, useState } from "react";
import type { PoolSummary, TokenDetail, TrackedPair } from "@/lib/types";
import { CHAIN } from "@/lib/constants";
import {
  formatAge,
  formatPct,
  formatPrice,
  formatUsd,
  shortAddr,
} from "@/lib/format";
import { PriceChart } from "./PriceChart";
import { DirectSwap } from "./DirectSwap";
import { useWatchlist, WatchlistStar } from "./Watchlist";

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "muted";
}) {
  const cls = tone === "up" ? "up" : tone === "down" ? "down" : tone === "muted" ? "muted" : "";
  return (
    <div className="dstat">
      <div className="dstat-label">{label}</div>
      <div className={`dstat-value mono ${cls}`}>{value}</div>
    </div>
  );
}

function PctCell({ value }: { value: number | null }) {
  if (value == null) return <span className="muted mono">—</span>;
  return (
    <span className={`mono ${value > 0 ? "up" : value < 0 ? "down" : "muted"}`}>
      {formatPct(value)}
    </span>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

export function TokenDetailModal({
  pair,
  onClose,
}: {
  pair: TrackedPair;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<TokenDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartSource, setChartSource] = useState<
    "custom" | "gecko" | "birdeye" | "dexscreener"
  >("gecko");

  const address = pair.tokenAddress || pair.pairAddress;
  const dexUrl = `https://dexscreener.com/${CHAIN.id}/${pair.pairAddress || pair.tokenAddress}`;
  const { isWatched, toggle } = useWatchlist();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);

    if (!address) {
      setLoading(false);
      return;
    }

    fetch(`/api/token/${address}`)
      .then(async (r) => {
        const j = (await r.json()) as TokenDetail & { error?: string };
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        return j;
      })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const token = detail?.token || pair;
  const ohlcv = detail?.ohlcv ?? null;
  const showCustomChart = !!ohlcv && ohlcv.length >= 2;
  const iframeUrl = `https://www.geckoterminal.com/${CHAIN.id}/tokens/${address}?embed=1&info=0&swaps=0`;
  const birdeyeUrl = `https://birdeye.so/token/${address}?chain=robinhood&embed=1`;

  // Resolve which chart view to actually render (fall back to GeckoTerminal
  // embed if the user picked "custom" but we have no OHLCV data).
  const effectiveSource =
    chartSource === "custom" && !showCustomChart ? "gecko" : chartSource;
  const chartEmbedUrl =
    effectiveSource === "birdeye"
      ? birdeyeUrl
      : effectiveSource === "dexscreener"
        ? dexUrl
        : iframeUrl;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${token.symbol} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close detail">
          ✕
        </button>

        <header className="dhead">
          {token.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="dhead-icon" src={token.imageUrl} alt="" width={44} height={44} />
          ) : (
            <div
              className="dhead-icon"
              style={{
                background: `hsl(${(token.symbol || "??").charCodeAt(0) * 7 % 360} 70% 45%)`,
              }}
            >
              {(token.symbol || "?").slice(0, 2)}
            </div>
          )}
          <div className="dhead-meta">
            <div className="dhead-name">
              <span className="token-sym">{token.symbol}</span>
              {pair.boosted ? (
                <span className="boost-indicator">⚡{pair.boostAmount ?? ""}</span>
              ) : null}
              <WatchlistStar pair={pair} isWatched={isWatched(pair.tokenAddress)} onToggle={toggle} />
            </div>
            <div className="dhead-sub">{token.name}</div>
            <button
              type="button"
              className="dhead-addr"
              title="Click to copy address"
              onClick={() => copyText(address)}
            >
              {shortAddr(address, 8, 6)}
            </button>
          </div>
          <div className="dhead-price">
            <div className="mono">{formatPrice(token.priceUsd)}</div>
            <PctCell value={token.priceChange24h} />
          </div>
        </header>

        <section className="dstats">
          <Stat label="Price" value={formatPrice(token.priceUsd)} />
          <Stat
            label="24h"
            value={token.priceChange24h == null ? "—" : formatPct(token.priceChange24h)}
            tone={token.priceChange24h != null ? (token.priceChange24h >= 0 ? "up" : "down") : "muted"}
          />
          <Stat label="MCap" value={formatUsd(token.marketCap ?? token.fdv)} />
          <Stat label="Liquidity" value={formatUsd(token.liquidityUsd)} />
          <Stat label="Vol 1h" value={formatUsd(token.volume1h)} />
          <Stat label="Vol 24h" value={formatUsd(token.volume24h)} />
          <Stat label="Age" value={formatAge(token.ageMs)} />
          <Stat
            label="Txns 24h"
            value={
              token.txns24h != null
                ? `${token.txns24h}${token.buys1h != null ? ` (${token.buys1h}↑/${token.sells1h ?? 0}↓)` : ""}`
                : "—"
            }
          />
        </section>

        <section className="dchart">
          <div className="dsection-title">Price chart</div>
          <div className="chart-src" role="tablist" aria-label="Chart source">
            {showCustomChart && (
              <button
                type="button"
                role="tab"
                aria-selected={effectiveSource === "custom"}
                className={effectiveSource === "custom" ? "active" : ""}
                onClick={() => setChartSource("custom")}
              >
                Custom
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={effectiveSource === "gecko"}
              className={effectiveSource === "gecko" ? "active" : ""}
              onClick={() => setChartSource("gecko")}
            >
              GeckoTerminal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={effectiveSource === "birdeye"}
              className={effectiveSource === "birdeye" ? "active" : ""}
              onClick={() => setChartSource("birdeye")}
            >
              Birdeye
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={effectiveSource === "dexscreener"}
              className={effectiveSource === "dexscreener" ? "active" : ""}
              onClick={() => setChartSource("dexscreener")}
            >
              DexScreener
            </button>
          </div>

          {loading ? (
            <div className="loading"><div className="spinner" /> Loading token detail…</div>
          ) : effectiveSource === "custom" ? (
            <PriceChart data={ohlcv as NonNullable<TokenDetail["ohlcv"]>} />
          ) : (
            <>
              <iframe
                className="chart-iframe"
                src={chartEmbedUrl}
                title="Token chart"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <div className="chart-open">
                Tidak termuat di dalam halaman?{" "}
                <a href={chartEmbedUrl} target="_blank" rel="noreferrer">
                  Buka di{" "}
                  {effectiveSource === "birdeye"
                    ? "Birdeye"
                    : effectiveSource === "dexscreener"
                      ? "DexScreener"
                      : "GeckoTerminal"}{" "}
                  ↗
                </a>
              </div>
            </>
          )}
        </section>

        {detail?.pools?.length ? (
          <section className="dpools">
            <div className="dsection-title">Pools ({detail.pools.length})</div>
            <div className="dpool-list">
              {detail.pools.map((p: PoolSummary) => (
                <a
                  key={p.poolAddress}
                  className="dpool"
                  href={`https://dexscreener.com/${CHAIN.id}/${p.poolAddress}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="dex-tag" title={p.dexId}>{p.dexName}</span>
                  <span className="mono">{formatPrice(p.priceUsd)}</span>
                  <span className="muted mono">Liq {formatUsd(p.liquidityUsd)}</span>
                  <span className="muted mono">Vol {formatUsd(p.volume24h)}</span>
                  <span className="muted mono">{formatAge(p.ageMs)}</span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section className="dswap">
          <DirectSwap
            tokenAddress={address}
            tokenSymbol={token.symbol}
            tokenPriceUsd={token.priceUsd}
          />
          {detail?.pools && detail.pools.length > 0 ? (
            <div className="swap-dexes">
              <span className="muted">Liquidity on:</span>
              <div className="row-actions">
                {detail.pools.map((p) => (
                  <a
                    key={p.poolAddress}
                    href={`https://dexscreener.com/${CHAIN.id}/${p.poolAddress}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {p.dexName}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
          <p className="swap-note muted">
            Swaps powered by Uniswap Protocol. Bridge and cross-chain routing
            supported via Robinhood Chain (4663).
          </p>
        </section>

        <section className="dlinks">
          <div className="dsection-title">Links</div>
          <div className="row-actions">
            <a href={pair.links.dexscreener} target="_blank" rel="noreferrer">DexS</a>
            <a href={pair.links.birdeye} target="_blank" rel="noreferrer">Birdeye</a>
            {pair.links.geckoterminal ? (
              <a href={pair.links.geckoterminal} target="_blank" rel="noreferrer">Geo</a>
            ) : (
              <a href={iframeUrl} target="_blank" rel="noreferrer">Geo</a>
            )}
            {pair.links.coingecko ? (
              <a href={pair.links.coingecko} target="_blank" rel="noreferrer">CG</a>
            ) : null}
            {pair.links.coinmarketcap ? (
              <a href={pair.links.coinmarketcap} target="_blank" rel="noreferrer">CMC</a>
            ) : null}
            <button type="button" onClick={() => copyText(address)} title="Copy address">
              Copy
            </button>
          </div>

          {(detail?.socials?.length || detail?.websites?.length) && (
            <div className="d-socials">
              {(detail?.websites || []).map((w, i) => (
                <a key={`w${i}`} href={w.url} target="_blank" rel="noreferrer">
                  {w.label || "Site"}
                </a>
              ))}
              {(detail?.socials || []).map((s, i) => (
                <a key={`s${i}`} href={s.url} target="_blank" rel="noreferrer">
                  {s.type}
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
