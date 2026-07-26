"use client";

/**
 * Responsive card view untuk layar mobile (<768px).
 *
 * Menggantikan horizontal-scroll table pada tampilang mobile.
 * Hanya berisi info high-signal per pair (symbol, price, pct changes,
 * liquidity, volume, txns, mcap, source badges, links). Click card →
 * open detail (onSelect). Re-use helpers & sub-components dari PairTable
 * supaya format konsisten.
 *
 * Toggle desktop/table mobile via CSS class di wrapper (see cardview.css).
 * Tidak ada JS hydration-mismatch risk: card ini di-render bersamaan
 * dengan table, tapi wrapper-nya di-show/hide via media query.
 */

import { useMemo, useState, useRef, useEffect } from "react";
import type { TrackedPair } from "@/lib/types";
import {
  formatAge,
  formatPct,
  formatPrice,
  formatUsd,
  shortAddr,
} from "@/lib/format";
import { SourceBadges } from "./SourceBadges";
import { WatchlistStar, useWatchlist } from "./Watchlist";
import { SocialLinks } from "./SocialLinks";
import { CHAIN } from "@/lib/constants";

const ROWS_OPTIONS = [25, 50, 100] as const;

/* ─── helpers (shared dengan PairTable, ada di format.ts) ─── */

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

function Pct({ value, flash }: { value: number | null; flash?: boolean }) {
  if (value == null) return <span className="pct flat">—</span>;
  const cls = value > 0 ? "pct up" : value < 0 ? "pct down" : "pct flat";
  return (
    <span className={`${cls} ${flash ? "flash-update" : ""}`}>
      {formatPct(value)}
    </span>
  );
}

function AgeBadge({ ageMs }: { ageMs: number | null }) {
  if (ageMs == null) return <span className="mono muted">—</span>;
  const cls =
    ageMs < 15 * 60 * 1000
      ? "age fresh"
      : ageMs < 2 * 60 * 60 * 1000
        ? "age hot"
        : "age";
  return <span className={cls}>{formatAge(ageMs)}</span>;
}

/* ─── price-flash hook — mirror of PairTable's usePriceFlash ─── */

function usePriceFlash(pairs: TrackedPair[]) {
  const prevPrices = useRef<
    Map<
      string,
      {
        price: number | null;
        change5m: number | null;
        change1h: number | null;
        change24h: number | null;
      }
    >
  >(new Map());
  const [flashingCells, setFlashingCells] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newFlashing = new Set<string>();

    pairs.forEach((pair) => {
      const key = pair.id + pair.pairAddress;
      const prev = prevPrices.current.get(key);

      if (prev) {
        if (prev.price !== pair.priceUsd && pair.priceUsd != null) {
          newFlashing.add(`${key}-price`);
        }
        if (prev.change5m !== pair.priceChange5m && pair.priceChange5m != null) {
          newFlashing.add(`${key}-5m`);
        }
        if (prev.change1h !== pair.priceChange1h && pair.priceChange1h != null) {
          newFlashing.add(`${key}-1h`);
        }
        if (
          prev.change24h !== pair.priceChange24h &&
          pair.priceChange24h != null
        ) {
          newFlashing.add(`${key}-24h`);
        }
      }

      prevPrices.current.set(key, {
        price: pair.priceUsd,
        change5m: pair.priceChange5m,
        change1h: pair.priceChange1h,
        change24h: pair.priceChange24h,
      });
    });

    if (newFlashing.size > 0) {
      setFlashingCells(newFlashing);
      const timer = setTimeout(() => setFlashingCells(new Set()), 1000);
      return () => clearTimeout(timer);
    }
  }, [pairs]);

  return flashingCells;
}

/* ─── PaginationBar — clone sederhana untuk card view ─── */

function PaginationBar({
  page,
  totalPages,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  totalItems,
}: {
  page: number;
  totalPages: number;
  rowsPerPage: number;
  onPageChange: (p: number) => void;
  onRowsPerPageChange: (r: number) => void;
  totalItems: number;
}) {
  const start = totalItems === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const end = Math.min(page * rowsPerPage, totalItems);

  return (
    <div className="pagination">
      <span className="pg-summary">
        Showing <strong>{start}–{end}</strong> of <strong>{totalItems}</strong>
      </span>

      <nav aria-label="Pagination" role="navigation">
        <label className="pg-rows">
          Rows:
          <select
            value={rowsPerPage}
            onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
            className="selectish"
          >
            {ROWS_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: 2 }}>
          <button
            type="button"
            className="page-btn"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            ‹
          </button>

          {generatePageNumbers(page, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`e${i}`} className="pg-ellipsis">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={`page-btn ${p === page ? "page-btn-active" : ""}`}
                onClick={() => onPageChange(p as number)}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </button>
            )
          )}

          <button
            type="button"
            className="page-btn"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      </nav>
    </div>
  );
}

function generatePageNumbers(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [];
  if (current <= 4) {
    for (let i = 1; i <= Math.min(5, total); i++) pages.push(i);
    pages.push("...");
    pages.push(total);
  } else if (current >= total - 3) {
    pages.push(1);
    pages.push("...");
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push("...");
    for (let i = current - 1; i <= current + 1; i++) pages.push(i);
    pages.push("...");
    pages.push(total);
  }
  return pages;
}

/* ─── Card View Component ─── */

export function PairCardView({
  pairs,
  emptyMessage,
  onSelect,
}: {
  pairs: TrackedPair[];
  emptyMessage?: string;
  onSelect?: (p: TrackedPair) => void;
}) {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(25);
  const { isWatched, toggle } = useWatchlist();
  const flashingCells = usePriceFlash(pairs);

  const totalPages = Math.max(1, Math.ceil(pairs.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  if (safePage !== page) setPage(safePage);

  const pagePairs = useMemo(
    () => pairs.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage),
    [pairs, safePage, rowsPerPage]
  );

  if (!pairs.length) {
    return (
      <div className="empty">{emptyMessage || "No pairs match your filters."}</div>
    );
  }

  return (
    <div className="card-view-wrap">
      <div className="card-list">
        {pagePairs.map((p, i) => {
          const key = p.id + p.pairAddress;
          return (
            <div
              key={key}
              className={`pair-card ${onSelect ? "card-clickable" : ""}`}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onClick={onSelect ? () => onSelect(p) : undefined}
              onKeyDown={
                onSelect
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(p);
                      }
                    }
                  : undefined
              }
            >
              {/* ─── Header: icon, symbol, age, watchlist ─── */}
              <div className="pc-head">
                <div className="pc-token">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="token-icon"
                      src={p.imageUrl}
                      alt=""
                      width={36}
                      height={36}
                      style={{ borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      className="token-icon"
                      style={{
                        background: `hsl(${(p.symbol || "??").charCodeAt(0) * 7 % 360} 70% 45%)`,
                      }}
                    >
                      {(p.symbol || "?").slice(0, 2)}
                    </div>
                  )}
                  <div className="pc-token-meta">
                    <div className="pc-token-name">
                      <span className="token-sym">{p.symbol}</span>
                      {p.boosted ? (
                        <span className="boost-indicator">
                          ⚡{p.boostAmount ?? ""}
                        </span>
                      ) : null}
                      <span className="pc-rank">#{(safePage - 1) * rowsPerPage + i + 1}</span>
                    </div>
                    <div className="pc-pair-line">
                      {p.symbol}/{p.quoteSymbol} · {p.dexName}
                    </div>
                    <button
                      type="button"
                      className="pc-addr"
                      title="Click to copy token address"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyText(p.tokenAddress);
                      }}
                    >
                      {shortAddr(p.tokenAddress)}
                    </button>
                  </div>
                </div>

                <div className="pc-head-right">
                  <WatchlistStar
                    pair={p}
                    isWatched={isWatched(p.tokenAddress)}
                    onToggle={toggle}
                  />
                  <AgeBadge ageMs={p.ageMs} />
                </div>
              </div>

              {/* ─── Price + pct changes ─── */}
              <div className="pc-price-row">
                <div className="pc-price">
                  <span
                    className={`mono ${flashingCells.has(`${key}-price`) ? "flash-update" : ""}`}
                  >
                    {formatPrice(p.priceUsd)}
                  </span>
                </div>
                <div className="pc-pct-row">
                  <div className="pc-pct-cell">
                    <span className="pc-pct-label">5m</span>
                    <Pct
                      value={p.priceChange5m}
                      flash={flashingCells.has(`${key}-5m`)}
                    />
                  </div>
                  <div className="pc-pct-cell">
                    <span className="pc-pct-label">1h</span>
                    <Pct
                      value={p.priceChange1h}
                      flash={flashingCells.has(`${key}-1h`)}
                    />
                  </div>
                  <div className="pc-pct-cell">
                    <span className="pc-pct-label">24h</span>
                    <Pct
                      value={p.priceChange24h}
                      flash={flashingCells.has(`${key}-24h`)}
                    />
                  </div>
                </div>
              </div>

              {/* ─── Stats grid ─── */}
              <div className="pc-stats">
                <div className="pc-stat">
                  <span className="pc-stat-label">Liq</span>
                  <span className="mono">{formatUsd(p.liquidityUsd)}</span>
                </div>
                <div className="pc-stat">
                  <span className="pc-stat-label">Vol 1h</span>
                  <span className="mono">{formatUsd(p.volume1h)}</span>
                </div>
                <div className="pc-stat">
                  <span className="pc-stat-label">Txns</span>
                  <span
                    className="mono"
                    title={
                      p.buys1h != null || p.sells1h != null
                        ? `${p.buys1h ?? 0} buys ↑ / ${p.sells1h ?? 0} sells ↓`
                        : undefined
                    }
                  >
                    {p.txns1h != null ? p.txns1h : "—"}
                  </span>
                  {p.txns1h != null && p.txns1h > 0 && (
                    <span
                      className="tx-pulse"
                      title="Live transaction data — click card for stream"
                    >
                      ●
                    </span>
                  )}
                </div>
                <div className="pc-stat">
                  <span className="pc-stat-label">MCap</span>
                  <span className="mono">{formatUsd(p.marketCap ?? p.fdv)}</span>
                </div>
              </div>

               {/* ─── Footer: sources + social links + quick links ─── */}
               <div
                 className="pc-foot"
                 onClick={(e) => e.stopPropagation()}
               >
                 <SourceBadges sources={p.sources} />
                 <SocialLinks pair={p} compact maxLinks={4} />
                 <div className="pc-links">
                   <a
                     href={`https://dexscreener.com/${CHAIN.id}/${p.pairAddress || p.tokenAddress}`}
                     target="_blank"
                     rel="noreferrer"
                     title="DexScreener"
                   >
                     DexS
                   </a>
                   <a
                     href={p.links.birdeye}
                     target="_blank"
                     rel="noreferrer"
                     title="Birdeye"
                   >
                     Bird
                   </a>
                   {p.links.geckoterminal ? (
                     <a
                       href={p.links.geckoterminal}
                       target="_blank"
                       rel="noreferrer"
                       title="GeckoTerminal"
                     >
                       Geo
                     </a>
                   ) : null}
                   <button
                     type="button"
                     onClick={() => copyText(p.pairAddress || p.tokenAddress)}
                     title="Copy pair/token address"
                   >
                     Copy
                   </button>
                 </div>
               </div>
            </div>
          );
        })}
      </div>

      <PaginationBar
        page={safePage}
        totalPages={totalPages}
        rowsPerPage={rowsPerPage}
        onPageChange={setPage}
        onRowsPerPageChange={(n) => {
          setRowsPerPage(n);
          setPage(1);
        }}
        totalItems={pairs.length}
      />
    </div>
  );
}
