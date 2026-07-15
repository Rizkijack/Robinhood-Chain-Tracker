import { useFeedStore } from "@/lib/store";

export function Footer() {
  const { stats } = useFeedStore();
  return (
    <footer className="footer">
      <p>
        <strong>Robinhood Chain</strong> is an Arbitrum L2 (chain ID{" "}
        <strong>4663</strong>). Data aggregated from GeckoTerminal, DexScreener,
        and other public APIs across Uniswap V2/V3/V4, PancakeSwap, Bankr,
        Virtuals pools.
      </p>
      {stats?.dexes?.length ? (
        <div className="dex-tags">
          {stats.dexes.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      ) : null}
      <p style={{ marginTop: 10 }}>
        ⚠️ Not financial advice. New pairs carry high risk. Always DYOR.
      </p>
    </footer>
  );
}
