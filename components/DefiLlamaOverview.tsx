"use client";

import { useState, useEffect, useCallback } from "react";

interface DexVolumeData {
  total24h: number;
  total7d: number;
  change1d: number;
  change7d: number;
  protocols: {
    name: string;
    displayName: string;
    logo: string;
    category: string;
    total24h: number;
    total7d: number;
    change1d: number;
    change7d: number;
  }[];
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function pctColor(change: number): string {
  if (change > 0) return "#22c55e";
  if (change < 0) return "#ef4444";
  return "#888";
}

function pctArrow(change: number): string {
  if (change > 5) return "📈";
  if (change > 0) return "↑";
  if (change < -5) return "📉";
  if (change < 0) return "↓";
  return "→";
}

export function DefiLlamaOverview() {
  const [data, setData] = useState<DexVolumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/defillama/overview");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: DexVolumeData = await res.json();
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Skeleton Loading ──
  if (loading && !data) {
    return (
      <div className="defillama-overview">
        <h3 className="dl-title">🦙 DefiLlama — Robinhood Chain</h3>
        <div className="dl-metrics-skeleton">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-metric">
              <div className="skeleton-line w-24" />
              <div className="skeleton-line w-16 h-5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="defillama-overview">
        <h3 className="dl-title">🦙 DefiLlama</h3>
        <p className="dl-error">Could not load data: {error}</p>
      </div>
    );
  }

  if (!data) return null;

  const total24hFormatted = formatUsd(data.total24h);
  const total7dFormatted = formatUsd(data.total7d);

  return (
    <div className="defillama-overview">
      <div className="dl-header">
        <h3 className="dl-title">
          🦙 DefiLlama
          <span className="dl-subtitle">Robinhood Chain DEX Volume</span>
        </h3>
        <button
          className="dl-refresh"
          onClick={fetchData}
          title="Refresh"
          disabled={loading}
        >
          ↻
        </button>
      </div>

      {/* Summary metrics */}
      <div className="dl-metrics">
        <div className="dl-metric-card">
          <span className="dl-metric-label">24h Volume</span>
          <span className="dl-metric-value">{total24hFormatted}</span>
          <span className="dl-metric-change" style={{ color: pctColor(data.change1d) }}>
            {pctArrow(data.change1d)} {data.change1d.toFixed(1)}%
          </span>
        </div>
        <div className="dl-metric-card">
          <span className="dl-metric-label">7d Volume</span>
          <span className="dl-metric-value">{total7dFormatted}</span>
          <span className="dl-metric-change" style={{ color: pctColor(data.change7d) }}>
            {pctArrow(data.change7d)} {data.change7d.toFixed(1)}%
          </span>
        </div>
        <div className="dl-metric-card">
          <span className="dl-metric-label">Active DEXes</span>
          <span className="dl-metric-value">{data.protocols.length}</span>
        </div>
      </div>

      {/* Protocol breakdown */}
      {data.protocols.length > 0 && (
        <div className="dl-protocols">
          <h4 className="dl-protocols-title">Protocol Breakdown</h4>
          <div className="dl-protocol-list">
            {data.protocols.slice(0, 8).map((p) => (
              <div key={p.name} className="dl-protocol-item">
                <div className="dl-protocol-left">
                  {p.logo ? (
                    <img
                      src={p.logo}
                      alt={p.displayName}
                      className="dl-protocol-logo"
                      loading="lazy"
                    />
                  ) : (
                    <div className="dl-protocol-logo-fallback">
                      {p.displayName.charAt(0)}
                    </div>
                  )}
                  <div className="dl-protocol-info">
                    <span className="dl-protocol-name">{p.displayName}</span>
                    <span className="dl-protocol-category">{p.category}</span>
                  </div>
                </div>
                <div className="dl-protocol-right">
                  <span className="dl-protocol-volume">{formatUsd(p.total24h)}</span>
                  <span
                    className="dl-protocol-change"
                    style={{ color: pctColor(p.change1d) }}
                  >
                    {p.change1d > 0 ? "+" : ""}
                    {p.change1d.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dl-footer">
        <a
          href="https://defillama.com/chain/Robinhood%20Chain"
          target="_blank"
          rel="noopener noreferrer"
          className="dl-footer-link"
        >
          View on DefiLlama ↗
        </a>
      </div>
    </div>
  );
}
