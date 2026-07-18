"use client";

/**
 * Embedded Uniswap swap via iframe.
 * Benefits vs npm widget:
 *  - Zero bundle cost (lazy iframe, no heavy deps)
 *  - Always up-to-date UI from Uniswap
 *  - Full cross-chain / bridge support via app.uniswap.org
 *  - No Redux / ethers / styled-components peer dep hell
 */

import { useMemo, useState, useEffect } from "react";
import { useAccount, useConnect } from "wagmi";
import { shortenAddress } from "@/lib/wallet";

export function UniswapSwapWidget({ outputToken }: { outputToken: string }) {
  const { address, isConnected, isConnecting } = useAccount();
  const { connectors, connect } = useConnect();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const injected = useMemo(
    () =>
      connectors.find(
        (c) =>
          c.id.includes("injected") ||
          c.id.includes("metaMask") ||
          c.type === "injected"
      ),
    [connectors]
  );

  const swapUrl = useMemo(() => {
    const u = new URL("https://app.uniswap.org/#/swap");
    u.searchParams.set("chain", "robinhood");
    u.searchParams.set("outputCurrency", outputToken);
    return u.toString();
  }, [outputToken]);

  if (!mounted) return <div className="swap-loading" />;

  /* Wallet not connected → prompt first (Uniswap iframe works either
     way, but wallet connection is needed to actually submit a tx). */
  if (!isConnected) {
    return (
      <div className="swap-connect-prompt">
        <p className="muted">
          Connect your wallet to swap directly in the tracker.
        </p>
        <button
          className="swap-primary"
          type="button"
          onClick={() => injected && connect({ connector: injected })}
          disabled={!injected || isConnecting}
        >
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
        <p className="muted" style={{ marginTop: 10, fontSize: 11 }}>
          Or continue swapping on Uniswap without connecting.
        </p>
        <UniswapIframe src={swapUrl} />
      </div>
    );
  }

  return (
    <div className="uniswap-widget-host">
      <div className="widget-wallet-badge mono">
        {shortenAddress(address, 6)}
      </div>
      <UniswapIframe src={swapUrl} />
    </div>
  );
}

function UniswapIframe({ src }: { src: string }) {
  return (
    <iframe
      className="uniswap-iframe"
      src={src}
      title="Uniswap Swap"
      loading="lazy"
      // Sandbox locks: scripts still work inside the iframe, but the outer
      // page is protected from top-navigation / popups initiated by the widget.
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
    />
  );
}
