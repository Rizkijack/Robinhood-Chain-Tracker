"use client";

import { useMemo } from "react";
import type { TrackedPair } from "@/lib/types";
import { formatUsd, formatPct, formatAge } from "@/lib/format";

interface AiTokenSummaryProps {
  pair: TrackedPair;
}

interface SummaryInsight {
  type: "positive" | "negative" | "neutral" | "info";
  label: string;
}

export function AiTokenSummary({ pair }: AiTokenSummaryProps) {
  const summary = useMemo(() => generateSummary(pair), [pair]);

  if (!summary) return null;

  return (
    <div className="ai-summary">
      <div className="ai-summary-header">
        <span className="ai-summary-icon">✦</span>
        <span className="ai-summary-title">AI Analysis</span>
        <span className="ai-summary-badge">Auto-generated</span>
      </div>
      <div className="ai-summary-body">
        {summary.text}
      </div>
      {summary.insights.length > 0 && (
        <div className="ai-summary-tags">
          {summary.insights.map((insight, i) => (
            <span key={i} className={`ai-tag ai-tag-${insight.type}`}>
              {insight.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function generateSummary(pair: TrackedPair): { text: string; insights: SummaryInsight[] } | null {
  const insights: SummaryInsight[] = [];
  const parts: string[] = [];

  // Token basics
  const age = pair.ageMs ? formatAge(pair.ageMs) : "unknown age";
  parts.push(`<strong>${pair.symbol}</strong> is a ${age} token on Robinhood Chain trading at <strong>${formatUsd(pair.priceUsd)}</strong>.`);

  // Liquidity analysis
  const liq = pair.liquidityUsd ?? 0;
  if (liq > 0) {
    if (liq < 10_000) {
      parts.push(`Liquidity is very low at ${formatUsd(liq)}, which means high slippage risk.`);
      insights.push({ type: "negative", label: "Low Liquidity" });
    } else if (liq < 100_000) {
      parts.push(`Liquidity is moderate at ${formatUsd(liq)}.`);
      insights.push({ type: "neutral", label: "Medium Liquidity" });
    } else {
      parts.push(`Liquidity is healthy at ${formatUsd(liq)}, allowing reasonable trade sizes.`);
      insights.push({ type: "positive", label: "Good Liquidity" });
    }
  }

  // Volume analysis
  const vol24 = pair.volume24h ?? 0;
  const vol1h = pair.volume1h ?? 0;
  if (vol24 > 0) {
    const volToLiq = liq > 0 ? vol24 / liq : 0;
    if (volToLiq > 5) {
      parts.push(`Extremely high volume/liquidity ratio (${volToLiq.toFixed(1)}x in 24h) — could indicate heavy speculation.`);
      insights.push({ type: "info", label: "High Activity" });
    } else if (volToLiq > 1) {
      parts.push(`Volume is ${volToLiq.toFixed(1)}x the liquidity — decent trading interest.`);
    }
  }

  if (vol1h > 0 && vol24 > 0) {
    const hourlyPct = (vol1h / vol24) * 100;
    if (hourlyPct > 20) {
      parts.push(`Recent 1h volume (${formatUsd(vol1h)}) is ${hourlyPct.toFixed(0)}% of 24h volume — momentum picking up.`);
      insights.push({ type: "positive", label: "Volume Spike" });
    }
  }

  // Price action
  const change1h = pair.priceChange1h ?? null;
  const change24h = pair.priceChange24h ?? null;
  if (change1h != null && Math.abs(change1h) > 10) {
    parts.push(`Price moved ${formatPct(change1h)} in the last hour.`);
    insights.push({
      type: change1h > 0 ? "positive" : "negative",
      label: `${change1h > 0 ? "↑" : "↓"} ${Math.abs(change1h).toFixed(0)}% (1h)`,
    });
  }

  if (change24h != null && Math.abs(change24h) > 20) {
    insights.push({
      type: change24h > 0 ? "positive" : "negative",
      label: `${change24h > 0 ? "↑" : "↓"} ${Math.abs(change24h).toFixed(0)}% (24h)`,
    });
  }

  // Buy/sell ratio
  const buys = pair.buys1h ?? pair.buys5m ?? 0;
  const sells = pair.sells1h ?? pair.sells5m ?? 0;
  const total = buys + sells;
  if (total > 10) {
    const buyPct = (buys / total) * 100;
    if (buyPct > 70) {
      parts.push(`Strong buy pressure: ${buyPct.toFixed(0)}% buys vs ${(100 - buyPct).toFixed(0)}% sells.`);
      insights.push({ type: "positive", label: "Buy Pressure" });
    } else if (buyPct < 30) {
      parts.push(`Heavy sell pressure: only ${buyPct.toFixed(0)}% buys.`);
      insights.push({ type: "negative", label: "Sell Pressure" });
    }
  }

  // Age risk
  if (pair.ageMs != null && pair.ageMs < 3_600_000) {
    parts.push("This token is less than 1 hour old — extremely high risk.");
    insights.push({ type: "negative", label: "Very New" });
  } else if (pair.ageMs != null && pair.ageMs < 86_400_000) {
    insights.push({ type: "info", label: "New Token" });
  }

  // Boost
  if (pair.boosted) {
    parts.push("This token is boosted (paid promotion).");
    insights.push({ type: "info", label: "Boosted" });
  }

  if (parts.length <= 1) return null;

  return {
    text: parts.join(" "),
    insights,
  };
}
