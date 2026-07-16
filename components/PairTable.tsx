"use client";

import { useMemo, useState } from "react";
import type { TrackedPair } from "@/lib/types";
import {
  formatAge,
  formatPct,
  formatPrice,
  formatUsd,
  shortAddr,
} from "@/lib/format";
import { SourceBadges } from "./SourceBadges";

const ROWS_OPTIONS = [25, 50, 100] as const;

function Pct({ value }: { value: number | null }) {
  if (value == null) return <span className="pct flat">—</span>;
  const cls =
    value > 0 ? "pct up" : value < 0 ? "pct down" : "pct flat";
  return <span className={cls}>{formatPct(value)}</span>;
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
                  <span className="mono">{formatPrice(p.priceUsd)}</span>
                </td>
                <td className="num">
                  <Pct value={p.priceChange5m} />
                </td>
                <td className="num">
                  <Pct value={p.priceChange1h} />
                </td>
                <td className="num">
                  <Pct value={p.priceChange24h} />
                </td>
                <td className="num">
                  <span className="mono">{formatUsd(p.liquidityUsd)}</span>
                </td>
                <td className="num">
                  <span className="mono">{formatUsd(p.volume1h)}</span>
                </td>
                <td className="num">
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
                    <a href={p.links.dexscreener} target="_blank" rel="noreferrer" title="DexScreener">
                      DexS
                    </a>
                    <a href={p.links.birdeye} target="_blank" rel="noreferrer" title="Birdeye">
                      Bird
                    </a>
                    {p.links.geckoterminal ? (
                      <a href={p.links.geckoterminal} target="_blank" rel="noreferrer" title="GeckoTerminal">
                        Geo
                      </a>
                    ) : null}
                    {p.links.coingecko ? (
                      <a href={p.links.coingecko} target="_blank" rel="noreferrer" title="CoinGecko">
                        CG
                      </a>
                    ) : null}
                    {p.links.coinmarketcap ? (
                      <a href={p.links.coinmarketcap} target="_blank" rel="noreferrer" title="CoinMarketCap">
                        CMC
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
  );
}
