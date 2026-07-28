"use client";

import { useMemo } from "react";
import { formatUsd } from "@/lib/format";
import type { WhaleFlowData } from "@/lib/types";

interface WhaleFlowChartProps {
  flowData: WhaleFlowData[];
  isLoading: boolean;
}

export function WhaleFlowChart({ flowData, isLoading }: WhaleFlowChartProps) {
  const stats = useMemo(() => {
    const totalInflow = flowData.reduce((s, d) => s + d.inflowUsd, 0);
    const totalOutflow = flowData.reduce((s, d) => s + d.outflowUsd, 0);
    const netFlow = totalInflow - totalOutflow;
    const totalTxns = flowData.reduce((s, d) => s + d.txCount, 0);

    // Top tokens across all buckets
    const tokenMap = new Map<string, number>();
    for (const d of flowData) {
      for (const t of d.topTokens) {
        tokenMap.set(t.symbol, (tokenMap.get(t.symbol) || 0) + t.volumeUsd);
      }
    }
    const topTokens = [...tokenMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([symbol, volume]) => ({ symbol, volume }));

    return { totalInflow, totalOutflow, netFlow, totalTxns, topTokens };
  }, [flowData]);

  const maxVolume = useMemo(() => {
    return Math.max(
      ...flowData.map((d) => Math.max(d.inflowUsd, d.outflowUsd)),
      1
    );
  }, [flowData]);

  if (isLoading && flowData.length === 0) {
    return (
      <div className="whale-flow">
        <div className="whale-flow-header">
          <span>📊</span>
          <span>Whale Flow Analytics</span>
        </div>
        <div className="whale-flow-loading">Loading flow data…</div>
      </div>
    );
  }

  return (
    <div className="whale-flow">
      <div className="whale-flow-header">
        <div className="whale-flow-title">
          <span>📊</span>
          <span>Whale Flow Analytics</span>
        </div>
        <span className="muted" style={{ fontSize: 11 }}>Last 4 hours</span>
      </div>

      {/* Summary stats */}
      <div className="whale-flow-stats">
        <div className="whale-flow-stat">
          <span className="whale-flow-stat-label">Inflow</span>
          <span className="whale-flow-stat-value positive">{formatUsd(stats.totalInflow)}</span>
        </div>
        <div className="whale-flow-stat">
          <span className="whale-flow-stat-label">Outflow</span>
          <span className="whale-flow-stat-value negative">{formatUsd(stats.totalOutflow)}</span>
        </div>
        <div className="whale-flow-stat">
          <span className="whale-flow-stat-label">Net Flow</span>
          <span className={`whale-flow-stat-value ${stats.netFlow >= 0 ? "positive" : "negative"}`}>
            {stats.netFlow >= 0 ? "+" : ""}{formatUsd(stats.netFlow)}
          </span>
        </div>
        <div className="whale-flow-stat">
          <span className="whale-flow-stat-label">Whale Txns</span>
          <span className="whale-flow-stat-value">{stats.totalTxns}</span>
        </div>
      </div>

      {/* Flow bars */}
      {flowData.length > 0 ? (
        <div className="whale-flow-chart">
          <div className="whale-flow-bars">
            {flowData.map((bucket, i) => {
              const inHeight = Math.max(2, (bucket.inflowUsd / maxVolume) * 100);
              const outHeight = Math.max(2, (bucket.outflowUsd / maxVolume) * 100);
              const isPositive = bucket.netFlowUsd >= 0;
              const time = new Date(bucket.timestamp);
              const label = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;

              return (
                <div key={i} className="whale-flow-bar-group" title={`Net: ${formatUsd(bucket.netFlowUsd)}`}>
                  <div className="whale-flow-bar-pair">
                    <div
                      className="whale-flow-bar inflow"
                      style={{ height: `${inHeight}%` }}
                    />
                    <div
                      className="whale-flow-bar outflow"
                      style={{ height: `${outHeight}%` }}
                    />
                  </div>
                  <div className={`whale-flow-net ${isPositive ? "positive" : "negative"}`}>
                    {isPositive ? "▲" : "▼"}
                  </div>
                  <span className="whale-flow-time">{label}</span>
                </div>
              );
            })}
          </div>
          <div className="whale-flow-legend">
            <span className="whale-flow-legend-item">
              <span className="whale-flow-legend-dot inflow" /> Inflow (buys)
            </span>
            <span className="whale-flow-legend-item">
              <span className="whale-flow-legend-dot outflow" /> Outflow (sells)
            </span>
          </div>
        </div>
      ) : (
        <div className="whale-flow-empty">No flow data available</div>
      )}

      {/* Top tokens */}
      {stats.topTokens.length > 0 && (
        <div className="whale-flow-tokens">
          <span className="whale-flow-tokens-label">Top tokens:</span>
          {stats.topTokens.map((t) => (
            <span key={t.symbol} className="whale-flow-token-chip">
              {t.symbol} <span className="muted">{formatUsd(t.volume)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
