"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsd, formatAge, shortAddr } from "@/lib/format";
import type { LaunchpadFeedResponse, LaunchpadToken, LaunchpadPhase } from "@/lib/sources/launchpad/types";

const DEFAULT_REFRESH_MS = 12_000;

type PhaseFilter = "all" | LaunchpadPhase;

/** Platform display colors (inline, mirrors badge CSS). */
const PLATFORM_STYLE: Record<string, { color: string; bg: string }> = {
  lemon: { color: "#a78bfa", bg: "rgba(167,139,250,.14)" },
  bankr: { color: "#22c55e", bg: "rgba(34,197,94,.14)" },
  poolstrade: { color: "#ff7ac3", bg: "rgba(255,122,195,.14)" },
  sushi: { color: "#f43f5e", bg: "rgba(244,63,94,.14)" },
  o1exchange: { color: "#22d3ee", bg: "rgba(34,211,238,.14)" },
  pons: { color: "#f59e0b", bg: "rgba(245,158,11,.14)" },
  ponsv2: { color: "#fbbf24", bg: "rgba(251,191,36,.14)" },
  flap: { color: "#fb7185", bg: "rgba(251,113,133,.14)" },
  trench: { color: "#4ade80", bg: "rgba(74,222,128,.14)" },
  bow: { color: "#c084fc", bg: "rgba(192,132,252,.14)" },
  bags: { color: "#60a5fa", bg: "rgba(96,165,250,.14)" },
};

function platformStyle(platform: string) {
  return PLATFORM_STYLE[platform] ?? { color: "var(--text-dim)", bg: "var(--bg-2)" };
}

function PhaseBadge({ phase }: { phase: LaunchpadPhase }) {
  const map: Record<LaunchpadPhase, { label: string; cls: string }> = {
    bonding: { label: "Bonding", cls: "lp-phase-bonding" },
    auction: { label: "Auction", cls: "lp-phase-auction" },
    graduated: { label: "Graduated", cls: "lp-phase-graduated" },
  };
  const m = map[phase];
  return <span className={`lp-phase ${m.cls}`}>{m.label}</span>;
}

export function LaunchpadTable() {
  const [data, setData] = useState<LaunchpadFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<PhaseFilter>("all");
  const [lastFetch, setLastFetch] = useState<number | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/launchpads");
      const json = (await res.json()) as LaunchpadFeedResponse & { error?: string };
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
      setLastFetch(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    const refreshMs = Math.max(data?.recommendedRefreshMs ?? DEFAULT_REFRESH_MS, 5_000);
    const id = setInterval(fetchFeed, refreshMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFeed]);

  const tokens = (data?.tokens ?? []).filter(
    (t) => phase === "all" || t.phase === phase
  );

  const totalVolume = tokens.reduce((s, t) => s + (t.volume24hUsd ?? 0), 0);

  return (
    <section className="launchpad-table">
      <div className="launchpad-header">
        <div className="launchpad-title">
          <span>🚀</span>
          <span>Launchpad Tokens</span>
          <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>
            {tokens.length} tokens · {formatUsd(totalVolume)} 24h vol
          </span>
        </div>
        <div className="launchpad-phase-filters">
          {(["all", "bonding", "auction", "graduated"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`launchpad-phase-btn ${phase === p ? "active" : ""}`}
              onClick={() => setPhase(p)}
            >
              {p === "all" ? "All" : p === "bonding" ? "Bonding" : p === "auction" ? "Auction" : "Graduated"}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="error-box">{error}</div>
      ) : loading && !data ? (
        <div className="skeleton-rows">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <div className="launchpad-empty">
          {loading ? "Loading launchpad tokens…" : "No launchpad tokens found"}
        </div>
      ) : (
        <div className="launchpad-list">
          <div className="launchpad-cols-header" aria-hidden="true">
            <span>Token</span>
            <span>Platform</span>
            <span>Phase</span>
            <span>Price</span>
            <span>FDV</span>
            <span>Liquidity</span>
            <span>Vol 24h</span>
            <span>Age</span>
            <span />
          </div>
          {tokens.map((t) => (
            <LaunchpadRow key={t.id} token={t} />
          ))}
        </div>
      )}

      <div className="launchpad-footer">
        <span className="muted" style={{ fontSize: 11 }}>
          Sources: {data?.sources?.join(" · ") || "—"}
          {data?.errors?.length ? ` · ⚠ ${data.errors.length} source error(s)` : ""}
          {lastFetch ? ` · updated ${formatAge(Date.now() - lastFetch)} ago` : ""}
        </span>
      </div>
    </section>
  );
}

function LaunchpadRow({ token }: { token: LaunchpadToken }) {
  const style = platformStyle(token.platform);
  const progress =
    token.graduationProgressPct != null
      ? Math.min(100, Math.max(0, token.graduationProgressPct))
      : null;

  return (
    <div className="launchpad-row">
      <div className="launchpad-token">
        {token.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={token.imageUrl} alt="" className="launchpad-logo" width={22} height={22} />
        ) : (
          <span className="launchpad-logo launchpad-logo-fallback">{token.symbol.slice(0, 1)}</span>
        )}
        <div className="launchpad-token-info">
          <span className="launchpad-token-symbol">{token.symbol}</span>
          <span className="launchpad-token-name" title={token.tokenAddress}>
            {token.name.length > 24 ? `${token.name.slice(0, 24)}…` : token.name}
          </span>
        </div>
      </div>

      <span className="launchpad-platform" style={{ color: style.color, background: style.bg }}>
        {token.platformName}
      </span>

      <div className="launchpad-phase-cell">
        <PhaseBadge phase={token.phase} />
        {progress != null && (
          <div className="launchpad-progress">
            <div className="launchpad-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <span className="launchpad-price">{token.priceUsd != null ? formatUsd(token.priceUsd) : "—"}</span>
      <span className="launchpad-fdv">{token.fdvUsd != null ? formatUsd(token.fdvUsd) : "—"}</span>
      <span className="launchpad-liq">{token.liquidityUsd != null ? formatUsd(token.liquidityUsd) : "—"}</span>
      <span className="launchpad-vol">{token.volume24hUsd != null ? formatUsd(token.volume24hUsd) : "—"}</span>
      <span className="launchpad-age">
        {token.ageMs != null ? `${formatAge(token.ageMs)} ago` : "—"}
      </span>

      <span className="launchpad-links">
        <a
          href={`https://dexscreener.com/robinhood/${token.pairAddress || token.tokenAddress}`}
          target="_blank"
          rel="noreferrer"
          className="lp-link"
          title="DexScreener"
        >
          ↗
        </a>
        <span className="lp-addr" title={token.tokenAddress}>
          {shortAddr(token.tokenAddress, 4, 4)}
        </span>
      </span>
    </div>
  );
}
