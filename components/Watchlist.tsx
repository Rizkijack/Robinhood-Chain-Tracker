"use client";

/**
 * Watchlist — localStorage-persisted favorite tokens.
 * Users can star tokens from the pair table and track them in a dedicated tab.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import type { TrackedPair } from "@/lib/types";
import { formatUsd, formatPrice, formatPct, shortAddr } from "@/lib/format";

const STORAGE_KEY = "rh-tracker-watchlist";

export interface WatchlistItem {
  tokenAddress: string;
  symbol: string;
  name: string;
  addedAt: number;
}

function loadWatchlist(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWatchlist(items: WatchlistItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    setItems(loadWatchlist());
  }, []);

  const add = useCallback((pair: TrackedPair) => {
    setItems((prev) => {
      if (prev.some((i) => i.tokenAddress === pair.tokenAddress)) return prev;
      const next = [
        ...prev,
        {
          tokenAddress: pair.tokenAddress,
          symbol: pair.symbol,
          name: pair.name,
          addedAt: Date.now(),
        },
      ];
      saveWatchlist(next);
      return next;
    });
  }, []);

  const remove = useCallback((tokenAddress: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.tokenAddress !== tokenAddress);
      saveWatchlist(next);
      return next;
    });
  }, []);

  const toggle = useCallback(
    (pair: TrackedPair) => {
      if (items.some((i) => i.tokenAddress === pair.tokenAddress)) {
        remove(pair.tokenAddress);
      } else {
        add(pair);
      }
    },
    [items, add, remove]
  );

  const isWatched = useCallback(
    (tokenAddress: string) => items.some((i) => i.tokenAddress === tokenAddress),
    [items]
  );

  return { items, add, remove, toggle, isWatched };
}

/** Star button for toggling watchlist membership */
export function WatchlistStar({
  pair,
  isWatched,
  onToggle,
}: {
  pair: TrackedPair;
  isWatched: boolean;
  onToggle: (pair: TrackedPair) => void;
}) {
  return (
    <button
      type="button"
      className={`watchlist-star ${isWatched ? "watched" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(pair);
      }}
      title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
      aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
    >
      {isWatched ? "★" : "☆"}
    </button>
  );
}

/** Watchlist panel showing all tracked tokens */
export function WatchlistPanel({
  pairs,
  onSelect,
  onRemove,
}: {
  pairs: TrackedPair[];
  onSelect?: (p: TrackedPair) => void;
  onRemove?: (tokenAddress: string) => void;
}) {
  if (!pairs.length) {
    return (
      <div className="watchlist-empty">
        <div className="watchlist-empty-icon">☆</div>
        <p>Your watchlist is empty.</p>
        <p className="muted" style={{ fontSize: 12 }}>
          Click the star icon on any token to add it here.
        </p>
      </div>
    );
  }

  return (
    <div className="watchlist-list">
      {pairs.map((p) => (
        <div
          key={p.tokenAddress}
          className="watchlist-item"
          onClick={onSelect ? () => onSelect(p) : undefined}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
        >
          <div className="watchlist-item-icon">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt="" width={32} height={32} style={{ borderRadius: "50%" }} />
            ) : (
              <div
                className="holding-icon-placeholder"
                style={{
                  background: `hsl(${(p.symbol || "??").charCodeAt(0) * 7 % 360} 70% 45%)`,
                }}
              >
                {(p.symbol || "?").slice(0, 2)}
              </div>
            )}
          </div>
          <div className="watchlist-item-info">
            <div className="watchlist-item-name">
              <span className="token-sym">{p.symbol}</span>
              <span className="watchlist-item-pair">{p.name}</span>
            </div>
            <div className="watchlist-item-addr" title={p.tokenAddress}>
              {shortAddr(p.tokenAddress)}
            </div>
          </div>
          <div className="watchlist-item-price">
            <div className="mono">{formatPrice(p.priceUsd)}</div>
            <div className={`mono ${p.priceChange24h != null && p.priceChange24h >= 0 ? "up" : "down"}`}>
              {p.priceChange24h != null ? formatPct(p.priceChange24h) : "—"}
            </div>
          </div>
          <div className="watchlist-item-lp">
            <div className="muted" style={{ fontSize: 10 }}>Liq</div>
            <div className="mono" style={{ fontSize: 12 }}>{formatUsd(p.liquidityUsd)}</div>
          </div>
          {onRemove && (
            <button
              type="button"
              className="watchlist-remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(p.tokenAddress);
              }}
              title="Remove from watchlist"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
