"use client";

import React, { useState } from "react";
import { useWalletContext } from "./WalletContext";
import { formatWalletAddress } from "@/lib/wallet-service";
import { WALLET_EXPLORER_BASE } from "./useWallet";

export function WalletBalance() {
  const {
    address,
    via,
    balance,
    balanceLoading,
    balanceError,
    refreshBalance,
  } = useWalletContext();

  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!address) {
    return (
      <div className="wallet-balance wallet-balance-empty">
        <p>Connect your wallet to view balance</p>
      </div>
    );
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshBalance();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="wallet-balance">
      <div className="wallet-balance-header">
        <div className="wallet-balance-info">
          <h3>Wallet Balance</h3>
          <a
            href={`${WALLET_EXPLORER_BASE}${address}`}
            target="_blank"
            rel="noreferrer"
            className="wallet-address-link"
          >
            {formatWalletAddress(address)}
          </a>
          {via && <span className="wallet-via-badge">{via === "privy" ? "Privy" : "External"}</span>}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={balanceLoading || isRefreshing}
          className="wallet-refresh-btn"
          aria-label="Refresh balance"
        >
          <RefreshIcon className={isRefreshing ? "rotating" : ""} />
        </button>
      </div>

      {balanceLoading && (
        <div className="wallet-balance-loading">
          <div className="spinner"></div>
          <p>Loading balance...</p>
        </div>
      )}

      {balanceError && (
        <div className="wallet-balance-error">
          <p>⚠️ {balanceError}</p>
          <button type="button" onClick={handleRefresh} className="retry-link">
            Retry
          </button>
        </div>
      )}

      {balance && !balanceLoading && (
        <div className="wallet-balance-display">
          <div className="balance-amount">
            <span className="balance-value">{balance.formatted}</span>
            <span className="balance-symbol">{balance.symbol}</span>
          </div>
          <p className="balance-address-full">{address}</p>
        </div>
      )}

      <style jsx>{`
        .wallet-balance {
          padding: 1.5rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.75rem;
          background: var(--card-bg, #ffffff);
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .wallet-balance-empty {
          text-align: center;
          color: var(--text-secondary, #6b7280);
          padding: 2rem 1.5rem;
          background: var(--card-bg-alt, #f9fafb);
          border: 2px dashed var(--border-color, #e5e7eb);
        }

        .wallet-balance-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        .wallet-balance-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .wallet-balance-info h3 {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .wallet-address-link {
          font-family: monospace;
          font-size: 0.875rem;
          color: var(--link-color, #3b82f6);
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
        }

        .wallet-address-link:hover {
          text-decoration: underline;
        }

        .wallet-via-badge {
          display: inline-flex;
          width: fit-content;
          padding: 0.25rem 0.625rem;
          background: var(--badge-bg, #f0f4f8);
          color: var(--badge-text, #475569);
          font-size: 0.75rem;
          font-weight: 500;
          border-radius: 9999px;
          text-transform: capitalize;
        }

        .wallet-refresh-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          padding: 0;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.5rem;
          background: var(--button-bg, #f3f4f6);
          color: var(--text-primary, #111827);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .wallet-refresh-btn:hover:not(:disabled) {
          background: var(--button-bg-hover, #e5e7eb);
          border-color: var(--border-color-hover, #d1d5db);
        }

        .wallet-refresh-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .wallet-refresh-btn svg {
          width: 1rem;
          height: 1rem;
        }

        .wallet-refresh-btn svg.rotating {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .wallet-balance-loading,
        .wallet-balance-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          text-align: center;
        }

        .wallet-balance-error {
          background: var(--error-bg, #fef2f2);
          border: 1px solid var(--error-border, #fecaca);
          border-radius: 0.5rem;
          color: var(--error-text, #991b1b);
        }

        .wallet-balance-error p {
          margin: 0;
          font-size: 0.875rem;
        }

        .spinner {
          width: 1.25rem;
          height: 1.25rem;
          border: 2px solid var(--spinner-track, #e5e7eb);
          border-top-color: var(--spinner-color, #3b82f6);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .wallet-balance-display {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .balance-amount {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
        }

        .balance-value {
          font-size: 2rem;
          font-weight: 700;
          color: var(--text-primary, #111827);
          font-family: monospace;
        }

        .balance-symbol {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
          text-transform: uppercase;
        }

        .balance-address-full {
          margin: 0;
          font-family: monospace;
          font-size: 0.75rem;
          color: var(--text-secondary, #6b7280);
          word-break: break-all;
        }

        .retry-link {
          background: none;
          border: none;
          color: var(--link-color, #3b82f6);
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          padding: 0;
          text-decoration: underline;
        }

        .retry-link:hover {
          color: var(--link-color-hover, #1d4ed8);
        }

        @media (max-width: 640px) {
          .wallet-balance {
            padding: 1rem;
          }

          .balance-value {
            font-size: 1.5rem;
          }

          .wallet-address-link {
            font-size: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}

function RefreshIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10"></polyline>
      <polyline points="1 20 1 14 7 14"></polyline>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"></path>
    </svg>
  );
}
