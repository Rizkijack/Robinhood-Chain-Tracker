"use client";

import { useState } from "react";

export interface AdvancedFilter {
  volumeSpike: boolean;
  minBuyRatio: number;
  maxBuyRatio: number;
  minHolders: number;
  maxAgeMinutes: number;
  minTxns: number;
  liquidityRange: "any" | "low" | "medium" | "high";
}

interface AdvancedFiltersProps {
  filter: AdvancedFilter;
  onChange: (filter: AdvancedFilter) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const DEFAULT_FILTER: AdvancedFilter = {
  volumeSpike: false,
  minBuyRatio: 0,
  maxBuyRatio: 100,
  minHolders: 0,
  maxAgeMinutes: 0,
  minTxns: 0,
  liquidityRange: "any",
};

export function AdvancedFilters({
  filter,
  onChange,
  isOpen,
  onToggle,
}: AdvancedFiltersProps) {
  const update = (partial: Partial<AdvancedFilter>) => {
    onChange({ ...filter, ...partial });
  };

  return (
    <div className="advanced-filters">
      <button
        type="button"
        className="adv-filter-toggle"
        onClick={onToggle}
      >
        <span>🎯</span>
        <span>Advanced Filters</span>
        <span className="adv-filter-arrow">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="adv-filter-body">
          <div className="adv-filter-row">
            <label className="adv-filter-label">
              <input
                type="checkbox"
                checked={filter.volumeSpike}
                onChange={(e) => update({ volumeSpike: e.target.checked })}
              />
              Volume Spike Only (1h &gt; 20% of 24h)
            </label>
          </div>

          <div className="adv-filter-row">
            <label className="adv-filter-label">Buy/Sell Ratio</label>
            <div className="adv-filter-range">
              <input
                type="number"
                min={0}
                max={100}
                value={filter.minBuyRatio}
                onChange={(e) => update({ minBuyRatio: Number(e.target.value) })}
                className="adv-input"
                placeholder="Min %"
              />
              <span className="muted">—</span>
              <input
                type="number"
                min={0}
                max={100}
                value={filter.maxBuyRatio}
                onChange={(e) => update({ maxBuyRatio: Number(e.target.value) })}
                className="adv-input"
                placeholder="Max %"
              />
              <span className="muted mono" style={{ fontSize: 10 }}>% buys</span>
            </div>
          </div>

          <div className="adv-filter-row">
            <label className="adv-filter-label">Min Txns (24h)</label>
            <input
              type="number"
              min={0}
              value={filter.minTxns}
              onChange={(e) => update({ minTxns: Number(e.target.value) })}
              className="adv-input"
              placeholder="0"
              style={{ width: 100 }}
            />
          </div>

          <div className="adv-filter-row">
            <label className="adv-filter-label">Liquidity Tier</label>
            <div className="seg">
              {(["any", "low", "medium", "high"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={filter.liquidityRange === opt ? "active" : ""}
                  onClick={() => update({ liquidityRange: opt })}
                >
                  {opt === "any" ? "Any" : opt === "low" ? "<$10k" : opt === "medium" ? "$10k-$100k" : ">$100k"}
                </button>
              ))}
            </div>
          </div>

          <div className="adv-filter-row">
            <button
              type="button"
              className="adv-reset"
              onClick={() => onChange(DEFAULT_FILTER)}
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Apply advanced filters to a list of pairs.
 */
export function applyAdvancedFilters<T extends {
  volume1h?: number | null;
  volume24h?: number | null;
  buys1h?: number | null;
  sells1h?: number | null;
  txns24h?: number | null;
  liquidityUsd?: number | null;
}>(pairs: T[], filter: AdvancedFilter): T[] {
  let result = [...pairs];

  if (filter.volumeSpike) {
    result = result.filter((p) => {
      const v1h = p.volume1h ?? 0;
      const v24h = p.volume24h ?? 0;
      return v24h > 0 && v1h / v24h > 0.2;
    });
  }

  if (filter.minBuyRatio > 0 || filter.maxBuyRatio < 100) {
    result = result.filter((p) => {
      const buys = p.buys1h ?? 0;
      const sells = p.sells1h ?? 0;
      const total = buys + sells;
      if (total < 5) return true; // not enough data
      const ratio = (buys / total) * 100;
      return ratio >= filter.minBuyRatio && ratio <= filter.maxBuyRatio;
    });
  }

  if (filter.minTxns > 0) {
    result = result.filter((p) => (p.txns24h ?? 0) >= filter.minTxns);
  }

  if (filter.liquidityRange !== "any") {
    result = result.filter((p) => {
      const liq = p.liquidityUsd ?? 0;
      switch (filter.liquidityRange) {
        case "low": return liq < 10_000;
        case "medium": return liq >= 10_000 && liq < 100_000;
        case "high": return liq >= 100_000;
        default: return true;
      }
    });
  }

  return result;
}

export { DEFAULT_FILTER };
