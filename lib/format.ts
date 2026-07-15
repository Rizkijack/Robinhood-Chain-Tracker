export function shortAddr(addr: string, left = 6, right = 4): string {
  if (!addr || addr.length < left + right + 2) return addr || "—";
  return `${addr.slice(0, left)}…${addr.slice(-right)}`;
}

export function formatUsd(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (abs >= 1) return `$${n.toFixed(digits)}`;
  if (abs >= 0.0001) return `$${n.toFixed(6)}`;
  if (abs === 0) return "$0";
  return `$${n.toExponential(2)}`;
}

export function formatPrice(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  if (n === 0) return "$0";
  return `$${n.toExponential(3)}`;
}

export function formatPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatAge(ms: number | null | undefined): string {
  if (ms == null || ms < 0 || Number.isNaN(ms)) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  const days = Math.floor(hr / 24);
  return `${days}d`;
}

export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parsePairName(name: string): { base: string; quote: string } {
  // e.g. "POG / WETH 1%" or "CASHCAT / WETH"
  const cleaned = name.replace(/\s+\d+(\.\d+)?%\s*$/, "").trim();
  const parts = cleaned.split(/\s*\/\s*/);
  return {
    base: parts[0]?.trim() || name,
    quote: parts[1]?.trim() || "WETH",
  };
}
