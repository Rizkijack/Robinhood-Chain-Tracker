import type { TrackSource } from "@/lib/types";

const LABELS: Record<TrackSource, { label: string; className: string }> = {
  dexscreener: { label: "DexS", className: "badge-dex" },
  profiles: { label: "Profile", className: "badge-profile" },
  boosts: { label: "Boost", className: "badge-boost" },
  birdeye: { label: "Bird", className: "badge-birdeye" },
  geckoterminal: { label: "Geo", className: "badge-gecko" },
  coingecko: { label: "CG", className: "badge-cg" },
  coinmarketcap: { label: "CMC", className: "badge-cmc" },
};

export function SourceBadges({ sources }: { sources: TrackSource[] }) {
  const ordered: TrackSource[] = [
    "dexscreener",
    "profiles",
    "boosts",
    "birdeye",
    "geckoterminal",
    "coingecko",
    "coinmarketcap",
  ];
  const set = new Set(sources);
  return (
    <div className="sources">
      {ordered
        .filter((s) => set.has(s))
        .map((s) => (
          <span key={s} className={`badge ${LABELS[s].className}`}>
            {LABELS[s].label}
          </span>
        ))}
    </div>
  );
}
