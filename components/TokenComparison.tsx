"use client";

import { useMemo } from "react";
import type { TrackedPair } from "@/lib/types";
import { formatUsd, formatPct, formatAge } from "@/lib/format";

interface TokenComparisonProps {
  tokens: TrackedPair[];
  onRemove: (index: number) => void;
  onAdd: () => void;
  onClose: () => void;
}

export function TokenComparison({
  tokens,
  onRemove,
  onAdd,
  onClose,
}: TokenComparisonProps) {
  if (tokens.length < 2) return null;

  const metrics = useMemo(() => buildMetrics(tokens), [tokens]);

  return (
    <div className="compare-panel">
      <div className="compare-header">
        <div className="compare-title">
          <span>⚖️</span>
          <span>Token Comparison</span>
          <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>
            ({tokens.length} tokens)
          </span>
        </div>
        <button type="button" className="compare-close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div
        className="compare-grid"
        style={{ "--cols": tokens.length } as React.CSSProperties}
      >
        {/* Header row */}
        <div className="compare-label" style={{ background: "var(--bg-2)" }}>
          Token
        </div>
        {tokens.map((t, i) => (
          <div key={i} className="compare-token-header">
            <div className="token-sym">{t.symbol}</div>
            <button
              type="button"
              className="compare-remove"
              onClick={() => onRemove(i)}
              style={{
                fontSize: 9,
                color: "var(--text-mute)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 4px",
              }}
            >
              ✕ remove
            </button>
          </div>
        ))}

        {/* Metric rows */}
        {metrics.map((metric) => (
          <MetricRow key={metric.label} metric={metric} tokenCount={tokens.length} />
        ))}
      </div>

      {tokens.length < 4 && (
        <div style={{ padding: "8px 12px" }}>
          <button type="button" className="compare-add" onClick={onAdd}>
            + Add token to compare
          </button>
        </div>
      )}
    </div>
  );
}

interface MetricData {
  label: string;
  values: (number | null)[];
  format: "usd" | "pct" | "num" | "age";
  higherIsBetter: boolean;
}

function buildMetrics(tokens: TrackedPair[]): MetricData[] {
  return [
    {
      label: "Price",
      values: tokens.map((t) => t.priceUsd),
      format: "usd",
      higherIsBetter: true,
    },
    {
      label: "24h Change",
      values: tokens.map((t) => t.priceChange24h),
      format: "pct",
      higherIsBetter: true,
    },
    {
      label: "1h Change",
      values: tokens.map((t) => t.priceChange1h),
      format: "pct",
      higherIsBetter: true,
    },
    {
      label: "Market Cap",
      values: tokens.map((t) => t.marketCap ?? t.fdv),
      format: "usd",
      higherIsBetter: true,
    },
    {
      label: "Liquidity",
      values: tokens.map((t) => t.liquidityUsd),
      format: "usd",
      higherIsBetter: true,
    },
    {
      label: "Volume 24h",
      values: tokens.map((t) => t.volume24h),
      format: "usd",
      higherIsBetter: true,
    },
    {
      label: "Volume 1h",
      values: tokens.map((t) => t.volume1h),
      format: "usd",
      higherIsBetter: true,
    },
    {
      label: "Age",
      values: tokens.map((t) => t.ageMs),
      format: "age",
      higherIsBetter: false, // newer is riskier
    },
    {
      label: "Txns 24h",
      values: tokens.map((t) => t.txns24h),
      format: "num",
      higherIsBetter: true,
    },
    {
      label: "Buys (1h)",
      values: tokens.map((t) => t.buys1h),
      format: "num",
      higherIsBetter: true,
    },
    {
      label: "Sells (1h)",
      values: tokens.map((t) => t.sells1h),
      format: "num",
      higherIsBetter: false,
    },
  ];
}

function MetricRow({
  metric,
  tokenCount,
}: {
  metric: MetricData;
  tokenCount: number;
}) {
  const numericValues = metric.values.filter(
    (v): v is number => v != null && Number.isFinite(v)
  );
  const best =
    numericValues.length > 0
      ? metric.higherIsBetter
        ? Math.max(...numericValues)
        : Math.min(...numericValues)
      : null;
  const worst =
    numericValues.length > 1
      ? metric.higherIsBetter
        ? Math.min(...numericValues)
        : Math.max(...numericValues)
      : null;

  return (
    <>
      <div className="compare-label">{metric.label}</div>
      {metric.values.map((val, i) => {
        const isBest = val != null && best != null && val === best && numericValues.length > 1;
        const isWorst = val != null && worst != null && val === worst && numericValues.length > 1 && best !== worst;

        return (
          <div
            key={i}
            className={`compare-cell ${isBest ? "best" : ""} ${isWorst ? "worst" : ""}`}
          >
            {val != null ? formatMetricValue(val, metric.format) : "—"}
          </div>
        );
      })}
    </>
  );
}

function formatMetricValue(val: number, format: "usd" | "pct" | "num" | "age"): string {
  switch (format) {
    case "usd":
      return formatUsd(val);
    case "pct":
      return formatPct(val);
    case "num":
      return val >= 1000 ? `${(val / 1000).toFixed(1)}K` : String(val);
    case "age":
      return formatAge(val);
    default:
      return String(val);
  }
}
