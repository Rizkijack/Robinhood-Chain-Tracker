"use client";

/**
 * Wallet Portfolio — shows connected wallet's token holdings on Robinhood Chain.
 * Reads native ETH balance and discovers ERC20 token balances via known pair data.
 */

import { useState, useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import { formatUnits, type Address } from "viem";
import { useNativeBalance, useTokenBalance, useTokenInfo } from "@/hooks/useOnChain";
import { formatUsd, formatPrice, shortAddr } from "@/lib/format";
import { CHAIN } from "@/lib/constants";
import { shortenAddress } from "@/lib/wallet";

interface TokenHolding {
  address: string;
  symbol: string;
  name: string;
  balance: string;
  balanceNum: number;
  decimals: number;
  priceUsd: number | null;
  valueUsd: number | null;
  logoUrl?: string | null;
}

// Known token list for Robinhood Chain (common pairs)
const KNOWN_TOKENS: { address: string; symbol: string; name: string; decimals: number }[] = [
  // WETH
  {
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
  },
];

function HoldingRow({
  holding,
  onSelect,
}: {
  holding: TokenHolding;
  onSelect?: (addr: string) => void;
}) {
  return (
    <div
      className="holding-row"
      onClick={onSelect ? () => onSelect(holding.address) : undefined}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      <div className="holding-icon">
        {holding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={holding.logoUrl} alt="" width={28} height={28} style={{ borderRadius: "50%" }} />
        ) : (
          <div
            className="holding-icon-placeholder"
            style={{
              background: `hsl(${(holding.symbol || "??").charCodeAt(0) * 7 % 360} 70% 45%)`,
            }}
          >
            {(holding.symbol || "?").slice(0, 2)}
          </div>
        )}
      </div>
      <div className="holding-info">
        <div className="holding-name">
          <span className="holding-sym">{holding.symbol}</span>
          <span className="holding-full">{holding.name}</span>
        </div>
        <div className="holding-addr" title={holding.address}>
          {shortAddr(holding.address, 6, 4)}
        </div>
      </div>
      <div className="holding-amount">
        <div className="mono">{holding.balanceNum.toFixed(6)}</div>
        <div className="holding-price">
          {holding.priceUsd != null ? formatPrice(holding.priceUsd) : "—"}
        </div>
      </div>
      <div className="holding-value mono">
        {holding.valueUsd != null ? formatUsd(holding.valueUsd) : "—"}
      </div>
    </div>
  );
}

export function WalletPortfolio({ onTokenSelect }: { onTokenSelect?: (addr: string) => void }) {
  const { address: wallet, isConnected } = useAccount();
  const { balance: ethBalance, loading: ethLoading } = useNativeBalance(wallet ?? null);
  const [customTokens, setCustomTokens] = useState<string[]>([]);
  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Load saved tokens from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rh-tracker-portfolio-tokens");
      if (saved) setCustomTokens(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  // Save to localStorage when changed
  useEffect(() => {
    if (customTokens.length > 0) {
      localStorage.setItem("rh-tracker-portfolio-tokens", JSON.stringify(customTokens));
    }
  }, [customTokens]);

  const handleAddToken = () => {
    setAddError(null);
    const addr = addInput.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setAddError("Invalid contract address");
      return;
    }
    if (customTokens.includes(addr.toLowerCase())) {
      setAddError("Token already added");
      return;
    }
    setCustomTokens((prev) => [...prev, addr.toLowerCase()]);
    setAddInput("");
  };

  const handleRemoveToken = (addr: string) => {
    setCustomTokens((prev) => prev.filter((t) => t !== addr));
  };

  if (!isConnected) {
    return (
      <div className="portfolio-empty">
        <div className="portfolio-empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1" />
            <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2z" />
            <circle cx="17" cy="13" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <p>Connect your wallet to view holdings</p>
      </div>
    );
  }

  return (
    <div className="portfolio">
      <div className="portfolio-header">
        <div className="portfolio-wallet">
          <span className="connect-dot" />
          <span className="mono">{shortenAddress(wallet!, 8)}</span>
          <span className="portfolio-chain">{CHAIN.name}</span>
        </div>
      </div>

      {/* Native ETH Balance */}
      <div className="portfolio-native">
        <div className="portfolio-native-icon">
          <div className="holding-icon-placeholder" style={{ background: "linear-gradient(135deg, #627EEA, #3B5998)" }}>
            ETH
          </div>
        </div>
        <div className="portfolio-native-info">
          <div className="portfolio-native-name">{CHAIN.nativeGas}</div>
          <div className="portfolio-native-full">Native Token</div>
        </div>
        <div className="portfolio-native-balance">
          {ethLoading ? (
            <span className="muted">Loading...</span>
          ) : (
            <span className="mono">{ethBalance ? parseFloat(ethBalance).toFixed(6) : "0.000000"}</span>
          )}
        </div>
      </div>

      {/* Custom Token Holdings */}
      <div className="portfolio-tokens">
        <div className="portfolio-tokens-header">
          <span className="dsection-title">Token Holdings</span>
        </div>

        {customTokens.length === 0 ? (
          <div className="portfolio-no-tokens">
            <p className="muted">No tracked tokens. Add ERC20 contracts below.</p>
          </div>
        ) : (
          <div className="portfolio-holdings-list">
            {customTokens.map((addr) => (
              <HoldingItem key={addr} address={addr} onSelect={onTokenSelect} />
            ))}
          </div>
        )}

        {/* Add token input */}
        <div className="portfolio-add">
          <input
            className="portfolio-add-input"
            type="text"
            placeholder="Paste ERC20 contract address..."
            value={addInput}
            onChange={(e) => {
              setAddInput(e.target.value);
              setAddError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleAddToken()}
          />
          <button
            type="button"
            className="portfolio-add-btn"
            onClick={handleAddToken}
            disabled={!addInput.trim()}
          >
            + Add
          </button>
        </div>
        {addError && <div className="portfolio-add-error">{addError}</div>}
      </div>
    </div>
  );
}

/** Individual holding item with balance loading */
function HoldingItem({
  address,
  onSelect,
}: {
  address: string;
  onSelect?: (addr: string) => void;
}) {
  const { address: wallet } = useAccount();
  const { info, loading: infoLoading } = useTokenInfo(address);
  const { balance, isLoading: balLoading } = useTokenBalance(
    address,
    wallet ?? null,
    info?.decimals ?? 18
  );

  const holding: TokenHolding = {
    address,
    symbol: info?.symbol ?? "???",
    name: info?.name ?? "Loading...",
    balance: balance ?? "0",
    balanceNum: balance ? parseFloat(balance) : 0,
    decimals: info?.decimals ?? 18,
    priceUsd: null, // Would need price oracle integration
    valueUsd: null,
  };

  if (infoLoading || balLoading) {
    return (
      <div className="holding-row holding-loading">
        <span className="muted">Loading {shortAddr(address)}...</span>
      </div>
    );
  }

  return <HoldingRow holding={holding} onSelect={onSelect} />;
}
