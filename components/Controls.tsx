"use client";

import { useState } from "react";
import { useFilterStore } from "@/lib/store";

interface ControlsProps {
  dexOptions: string[];
  filteredCount: number;
}

const TABS: { key: "new" | "trending" | "boosts"; label: string }[] = [
  { key: "new", label: "New Pairs" },
  { key: "trending", label: "Trending" },
  { key: "boosts", label: "Boosts" },
];

export function Controls({ dexOptions, filteredCount }: ControlsProps) {
  const {
    tab,
    setTab,
    maxAgeHours,
    setMaxAgeHours,
    minLiq,
    setMinLiq,
    minVol,
    setMinVol,
    dexFilter,
    setDexFilter,
  } = useFilterStore();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const currentTab = tab as "new" | "trending" | "boosts";

  return (
    <div className="controls-wrap">
      <nav className="subnav" aria-label="Views">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`tab ${currentTab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}

        <div className="chain-group">
          <span style={{ color: "var(--text-mute)", fontSize: 12 }}>Robinhood Chain</span>
        </div>
      </nav>

      <div className={`filters ${!filtersOpen ? "filters-collapsed" : ""}`}>
        <button
          type="button"
          className="filters-trigger"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          aria-label="Toggle filters"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
          </svg>
          Filters
        </button>

        <div className="filters-content">
          <span className="filter-label">Age</span>
          <div className="seg">
            {["", "0.25", "1", "6", "24", "48"].map((v) => (
              <button
                key={v}
                type="button"
                className={maxAgeHours === v ? "active" : ""}
                onClick={() => setMaxAgeHours(v)}
              >
                {v === "" ? "Any" : v === "0.25" ? "15m" : `${v}h`}
              </button>
            ))}
          </div>

          <span className="filter-label">Liq</span>
          <select
            className="selectish"
            value={minLiq}
            onChange={(e) => setMinLiq(e.target.value)}
          >
            <option value="">Any liquidity</option>
            <option value="10000">$10K+</option>
            <option value="50000">$50K+</option>
            <option value="100000">$100K+</option>
            <option value="500000">$500K+</option>
          </select>

          <span className="filter-label">Vol</span>
          <select
            className="selectish"
            value={minVol}
            onChange={(e) => setMinVol(e.target.value)}
          >
            <option value="">Any volume</option>
            <option value="25000">$25K+</option>
            <option value="100000">$100K+</option>
            <option value="500000">$500K+</option>
            <option value="1000000">$1M+</option>
          </select>

          <span className="filter-label">DEX</span>
          <select
            className="selectish"
            value={dexFilter}
            onChange={(e) => setDexFilter(e.target.value)}
          >
            <option value="all">All</option>
            {dexOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <div className="meta-live" style={{ whiteSpace: "nowrap" }}>
            {filteredCount} tokens
          </div>
        </div>
      </div>
    </div>
  );
}
