"use client";

import { useState, useCallback } from "react";
import { formatUsd, formatAge, shortAddr } from "@/lib/format";
import { useWhaleStore } from "@/lib/store";
import type { WhaleWallet, WhaleTransaction } from "@/lib/types";

interface WhaleWalletTrackerProps {
  onWalletSelect?: (address: string) => void;
}

export function WhaleWalletTracker({ onWalletSelect }: WhaleWalletTrackerProps) {
  const { watchedWallets, addWatchedWallet, removeWatchedWallet, fetchWalletActivity } = useWhaleStore();
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const [walletTxs, setWalletTxs] = useState<WhaleTransaction[]>([]);
  const [loadingWallet, setLoadingWallet] = useState<string | null>(null);

  const handleAdd = useCallback(async () => {
    const addr = input.trim().toLowerCase();
    if (!addr || !addr.startsWith("0x") || addr.length !== 42) {
      setError("Enter a valid 0x address (42 chars)");
      return;
    }

    if (watchedWallets.some((w) => w.address === addr)) {
      setError("Already watching this wallet");
      return;
    }

    setAdding(true);
    setError(null);

    try {
      // Fetch wallet data to populate the card
      const txs = await fetchWalletActivity(addr);
      const totalValue = txs.reduce((sum: number, tx: WhaleTransaction) => sum + tx.usdValue, 0);
      const lastTx = txs[0];

      const wallet: WhaleWallet = {
        address: addr,
        label: shortAddr(addr, 6, 4),
        entity: lastTx?.entity || null,
        entityLogo: lastTx?.entityLogo || null,
        totalValueUsd: totalValue,
        lastActive: lastTx?.timestamp || Date.now(),
        txCount24h: txs.length,
        addedAt: Date.now(),
      };

      addWatchedWallet(wallet);
      setInput("");
    } catch {
      // Add wallet anyway with minimal data
      const wallet: WhaleWallet = {
        address: addr,
        label: shortAddr(addr, 6, 4),
        entity: null,
        entityLogo: null,
        totalValueUsd: 0,
        lastActive: 0,
        txCount24h: 0,
        addedAt: Date.now(),
      };
      addWatchedWallet(wallet);
      setInput("");
    } finally {
      setAdding(false);
    }
  }, [input, watchedWallets, addWatchedWallet, fetchWalletActivity]);

  const handleExpand = useCallback(
    async (address: string) => {
      if (expandedWallet === address) {
        setExpandedWallet(null);
        setWalletTxs([]);
        return;
      }

      setExpandedWallet(address);
      setLoadingWallet(address);
      const txs = await fetchWalletActivity(address);
      setWalletTxs(txs);
      setLoadingWallet(null);
    },
    [expandedWallet, fetchWalletActivity]
  );

  return (
    <div className="whale-wallet-tracker">
      <div className="whale-wallet-header">
        <div className="whale-wallet-title">
          <span>👁️</span>
          <span>Watched Wallets</span>
          {watchedWallets.length > 0 && (
            <span className="whale-wallet-count">{watchedWallets.length}</span>
          )}
        </div>
      </div>

      {/* Add wallet input */}
      <div className="whale-wallet-add">
        <input
          type="text"
          className="whale-wallet-input"
          placeholder="0x... paste wallet address"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          disabled={adding}
        />
        <button
          type="button"
          className="whale-wallet-add-btn"
          onClick={handleAdd}
          disabled={adding || !input.trim()}
        >
          {adding ? "…" : "+ Track"}
        </button>
      </div>

      {error && <div className="whale-wallet-error">{error}</div>}

      {/* Wallet list */}
      {watchedWallets.length === 0 ? (
        <div className="whale-wallet-empty">
          Paste a wallet address above to start tracking whale activity
        </div>
      ) : (
        <div className="whale-wallet-list">
          {watchedWallets.map((wallet) => (
            <div key={wallet.address} className="whale-wallet-card">
              <div
                className="whale-wallet-card-header"
                onClick={() => handleExpand(wallet.address)}
                role="button"
              >
                <div className="whale-wallet-card-info">
                  <div className="whale-wallet-card-name">
                    {wallet.entityLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={wallet.entityLogo} alt="" width={16} height={16} />
                    )}
                    <span>{wallet.entity || wallet.label}</span>
                  </div>
                  <div className="whale-wallet-card-meta">
                    <span className="whale-wallet-addr">{shortAddr(wallet.address, 6, 4)}</span>
                    {wallet.lastActive > 0 && (
                      <span className="whale-wallet-time">
                        {formatAge(Date.now() - wallet.lastActive)} ago
                      </span>
                    )}
                  </div>
                </div>
                <div className="whale-wallet-card-stats">
                  <span className="whale-wallet-value">{formatUsd(wallet.totalValueUsd)}</span>
                  <span className="whale-wallet-txs">{wallet.txCount24h} txns</span>
                </div>
                <button
                  type="button"
                  className="whale-wallet-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeWatchedWallet(wallet.address);
                  }}
                  title="Remove wallet"
                >
                  ×
                </button>
              </div>

              {/* Expanded: recent transactions */}
              {expandedWallet === wallet.address && (
                <div className="whale-wallet-detail">
                  {loadingWallet === wallet.address ? (
                    <div className="whale-wallet-loading">Loading transactions…</div>
                  ) : walletTxs.length === 0 ? (
                    <div className="whale-wallet-loading">No recent transactions found</div>
                  ) : (
                    <div className="whale-wallet-txs">
                      {walletTxs.slice(0, 10).map((tx) => (
                        <div key={tx.hash} className={`whale-wallet-tx whale-type-${tx.type}`}>
                          <span className="whale-wallet-tx-type">{tx.type}</span>
                          <span className="whale-wallet-tx-token">{tx.tokenSymbol}</span>
                          <span className="whale-wallet-tx-value">{formatUsd(tx.usdValue)}</span>
                          <span className="whale-wallet-tx-time">
                            {formatAge(Date.now() - tx.timestamp)} ago
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
