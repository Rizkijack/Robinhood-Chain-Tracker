"use client";

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
import { PairCardView } from "./PairCardView";
import { WatchlistStar, useWatchlist } from "./Watchlist";
import { SocialLinks } from "./SocialLinks";
import { TransactionCount } from "./TransactionCount";
import { CHAIN } from "@/lib/constants";

const ROWS_OPTIONS = [25, 50, 100] as const;

/** Hook to track which prices changed between renders */
function usePriceFlash(pairs: TrackedPair[]) {
  const prevPrices = useRef<Map<string, { price: number | null; change5m: number | null; change1h: number | null; change24h: number | null }>>(new Map());
  const [flashingCells, setFlashingCells] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newFlashing = new Set<string>();
    
    pairs.forEach((pair) => {
      const key = pair.id + pair.pairAddress;
      const prev = prevPrices.current.get(key);
      
      if (prev) {
        // Check price change
        if (prev.price !== pair.priceUsd && pair.priceUsd != null) {
          newFlashing.add(`${key}-price`);
        }
        // Check 5m change
        if (prev.change5m !== pair.priceChange5m && pair.priceChange5m != null) {
          newFlashing.add(`${key}-5m`);
        }
        // Check 1h change
        if (prev.change1h !== pair.priceChange1h && pair.priceChange1h != null) {
          newFlashing.add(`${key}-1h`);
        }
        // Check 24h change
        if (prev.change24h !== pair.priceChange24h && pair.priceChange24h != null) {
          newFlashing.add(`${key}-24h`);
        }
      }
      
      // Update previous values
      prevPrices.current.set(key, {
        price: pair.priceUsd,
        change5m: pair.priceChange5m,
        change1h: pair.priceChange1h,
        change24h: pair.priceChange24h,
      });
    });
    
    if (newFlashing.size > 0) {
      setFlashingCells(newFlashing);
      // Clear flash after animation
      const timer = setTimeout(() => setFlashingCells(new Set()), 1000);
      return () => clearTimeout(timer);
    }
  }, [pairs]);

  return flashingCells;
}

function Pct({ value, flash }: { value: number | null; flash?: boolean }) {
  if (value == null) return <span className="pct flat">—</span>;
  const cls =
    value > 0 ? "pct up" : value < 0 ? "pct down" : "pct flat";
  return <span className={`${cls} ${flash ? 'flash-update' : ''}`}>{formatPct(value)}</span>;
}

function AgeCell({ ageMs }: { ageMs: number | null }) {
  if (ageMs == null) return <span className="mono muted">—</span>;
  const cls =
    ageMs < 15 * 60 * 1000
      ? "age fresh"
      : ageMs < 2 * 60 * 60 * 1000
        ? "age hot"
        : "age";
  return <span className={cls}>{formatAge(ageMs)}</span>;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

/** Pagination controls rendered below the table. */
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

/** Generate condensed page number list with ellipsis, e.g. [1, '...', 5, 6, 7, '...', 20] */
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

export function PairTable({
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

  // Reset to page 1 when the data changes
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
    <>
      {/* Desktop: table view (hidden on mobile via CSS .table-scroll) */}
      <div className="table-wrap">
        <div className="table-scroll">
          <table className="pairs">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Token</th>
                <th>Age</th>
              <th>DEX</th>
              <th className="num">Price</th>
              <th className="num">5m</th>
              <th className="num">1h</th>
              <th className="num">24h</th>
              <th className="num">Liq</th>
              <th className="num">Vol 1h</th>
              <th className="num">Txns</th>
               <th className="num">MCap</th>
               <th>Src</th>
               <th>Links</th>
             </tr>
          </thead>
          <tbody>
            {pagePairs.map((p, i) => (
              <tr
                key={p.id + p.pairAddress}
                className={onSelect ? "row-clickable" : undefined}
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
                <td className="mono muted">{(safePage - 1) * rowsPerPage + i + 1}</td>
                <td>
                  <div className="token-cell">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="token-icon"
                        src={p.imageUrl}
                        alt=""
                        width={32}
                        height={32}
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
                    <div className="token-meta">
                      <div className="token-name">
                        <span className="token-sym">{p.symbol}</span>
                        {p.boosted ? (
                          <span className="boost-indicator">
                            ⚡{p.boostAmount ?? ""}
                          </span>
                        ) : null}
                        <WatchlistStar pair={p} isWatched={isWatched(p.tokenAddress)} onToggle={toggle} />
                      </div>
                      <div className="token-pair">
                        {p.symbol}/{p.quoteSymbol} · {p.name}
                      </div>
                      <div
                        className="token-pair"
                        title="Click to copy token address"
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          copyText(p.tokenAddress);
                        }}
                      >
                        {shortAddr(p.tokenAddress)}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <AgeCell ageMs={p.ageMs} />
                </td>
                <td>
                  <span className="dex-tag" title={p.dexId}>
                    {p.dexName}
                  </span>
                </td>
                <td className="num">
                  <span 
                    className={`mono ${flashingCells.has(`${p.id + p.pairAddress}-price`) ? 'flash-update' : ''}`}
                  >
                    {formatPrice(p.priceUsd)}
                  </span>
                </td>
                <td className="num">
                  <Pct 
                    value={p.priceChange5m} 
                    flash={flashingCells.has(`${p.id + p.pairAddress}-5m`)} 
                  />
                </td>
                <td className="num">
                  <Pct 
                    value={p.priceChange1h} 
                    flash={flashingCells.has(`${p.id + p.pairAddress}-1h`)} 
                  />
                </td>
                <td className="num">
                  <Pct 
                    value={p.priceChange24h} 
                    flash={flashingCells.has(`${p.id + p.pairAddress}-24h`)} 
                  />
                </td>
                <td className="num">
                  <span className="mono">{formatUsd(p.liquidityUsd)}</span>
                </td>
                <td className="num">
                  <span className="mono">{formatUsd(p.volume1h)}</span>
                </td>
                <td className="num">
                  <div className="transaction-cell">
                    <TransactionCount 
                      pairAddress={p.pairAddress}
                      tokenAddress={p.tokenAddress}
                      initialCount={p.txns1h || 0}
                    />
                    {p.txns1h != null && p.txns1h > 0 && (
                      <span
                        className="tx-pulse"
                        title="Live transaction data — click row for stream"
                      >
                        ●
                      </span>
                    )}
                  </div>
                </td>
                <td className="num">
                  <span className="mono">
                    {formatUsd(p.marketCap ?? p.fdv)}
                  </span>
                </td>
                <td>
                  <SourceBadges sources={p.sources} />
                </td>
                <td>
                  <div
                    className="row-actions links-compact"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SocialLinks pair={p} compact maxLinks={4} />
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

      {/* Mobile: card view (hidden on desktop via CSS .card-view-wrap) */}
      <PairCardView
        pairs={pairs}
        emptyMessage={emptyMessage}
        onSelect={onSelect}
      />
    </>
  );
}
