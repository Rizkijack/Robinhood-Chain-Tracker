"use client";

import React, { useEffect, useState } from "react";
import { useWalletContext } from "./WalletContext";
import { getNativeBalance, getPortfolioSummary, clearWalletCache } from "@/lib/balance-service";
import type { TokenBalance } from "@/lib/balance-service";

export function WalletAssets() {
  const { address, status } = useWalletContext();
  const [assets, setAssets] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"balance" | "symbol">("balance");

  useEffect(() => {
    if (!address || status !== "connected") {
      setAssets([]);
      return;
    }

    const fetchAssets = async () => {
      setLoading(true);
      setError(null);
      try {
        const balance = await getNativeBalance(address);
        if (balance) {
          setAssets([balance]);
        } else {
          setError("Failed to load assets");
        }
      } catch (err) {
        console.error("[WalletAssets] Error:", err);
        setError("Error loading assets");
      } finally {
        setLoading(false);
      }
    };

    fetchAssets();
    const interval = setInterval(fetchAssets, 15_000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [address, status]);

  const sortedAssets = [...assets].sort((a, b) => {
    if (sortBy === "balance") {
      return Number(b.formatted) - Number(a.formatted);
    }
    return a.token.symbol.localeCompare(b.token.symbol);
  });

  const handleRefresh = async () => {
    if (address) {
      clearWalletCache(address);
      setLoading(true);
      try {
        const balance = await getNativeBalance(address);
        if (balance) {
          setAssets([balance]);
        }
      } finally {
        setLoading(false);
      }
    }
  };

  if (!address || status !== "connected") {
    return (
      <div className="wallet-assets wallet-assets-empty">
        <p>Connect wallet to view assets</p>
      </div>
    );
  }

  if (loading && assets.length === 0) {
    return (
      <div className="wallet-assets wallet-assets-loading">
        <div className="spinner"></div>
        <p>Loading assets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wallet-assets wallet-assets-error">
        <p>⚠️ {error}</p>
        <button type="button" onClick={handleRefresh} className="retry-btn">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-assets">
      <div className="assets-header">
        <h3>Your Assets</h3>
        <div className="assets-controls">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "balance" | "symbol")}
            className="sort-select"
            aria-label="Sort assets by"
          >
            <option value="balance">Sort: Balance</option>
            <option value="symbol">Sort: Symbol</option>
          </select>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="refresh-btn"
            aria-label="Refresh assets"
          >
            {loading ? <Spinner /> : <RefreshIcon />}
          </button>
        </div>
      </div>

      {sortedAssets.length === 0 ? (
        <div className="assets-empty">
          <p>No assets found</p>
        </div>
      ) : (
        <div className="assets-table-container">
          <table className="assets-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Balance</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {sortedAssets.map((asset) => (
                <tr key={asset.token.address} className="asset-row">
                  <td className="asset-symbol">
                    <div className="asset-name">
                      <span className="symbol">{asset.token.symbol}</span>
                      <span className="name">{asset.token.name}</span>
                    </div>
                  </td>
                  <td className="asset-balance">
                    <span className="amount">{asset.formatted}</span>
                  </td>
                  <td className="asset-value">
                    {asset.usdValue ? `$${asset.usdValue.toFixed(2)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .wallet-assets {
          padding: 1.5rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.75rem;
          background: var(--card-bg, #ffffff);
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .wallet-assets-empty,
        .wallet-assets-loading,
        .wallet-assets-error {
          text-align: center;
          padding: 2rem 1.5rem;
          background: var(--card-bg-alt, #f9fafb);
          border: 2px dashed var(--border-color, #e5e7eb);
          border-radius: 0.5rem;
          color: var(--text-secondary, #6b7280);
        }

        .wallet-assets-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
        }

        .wallet-assets-error {
          background: var(--error-bg, #fef2f2);
          border-color: var(--error-border, #fecaca);
          color: var(--error-text, #991b1b);
        }

        .assets-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        .assets-header h3 {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .assets-controls {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .sort-select {
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.375rem;
          background: var(--button-bg, #f3f4f6);
          color: var(--text-primary, #111827);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .sort-select:hover {
          border-color: var(--border-color-hover, #d1d5db);
          background: var(--button-bg-hover, #e5e7eb);
        }

        .refresh-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          padding: 0;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.375rem;
          background: var(--button-bg, #f3f4f6);
          color: var(--text-primary, #111827);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .refresh-btn:hover:not(:disabled) {
          background: var(--button-bg-hover, #e5e7eb);
          border-color: var(--border-color-hover, #d1d5db);
        }

        .refresh-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .refresh-btn svg {
          width: 1rem;
          height: 1rem;
        }

        .assets-empty {
          text-align: center;
          padding: 2rem 1rem;
          color: var(--text-secondary, #6b7280);
        }

        .assets-table-container {
          overflow-x: auto;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.5rem;
        }

        .assets-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .assets-table thead {
          background: var(--table-header-bg, #f9fafb);
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .assets-table th {
          padding: 0.75rem;
          text-align: left;
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.05em;
        }

        .assets-table tbody tr {
          border-bottom: 1px solid var(--border-color, #e5e7eb);
          transition: background-color 0.2s ease;
        }

        .assets-table tbody tr:hover {
          background: var(--table-row-hover-bg, #f9fafb);
        }

        .assets-table tbody tr:last-child {
          border-bottom: none;
        }

        .assets-table td {
          padding: 0.75rem;
          color: var(--text-primary, #111827);
        }

        .asset-symbol {
          font-weight: 500;
        }

        .asset-name {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .symbol {
          font-weight: 600;
          font-size: 0.875rem;
        }

        .name {
          font-size: 0.75rem;
          color: var(--text-secondary, #6b7280);
        }

        .asset-balance,
        .asset-value {
          text-align: right;
          font-family: monospace;
        }

        .amount {
          font-weight: 500;
          font-size: 0.875rem;
        }

        .retry-btn {
          background: none;
          border: none;
          color: var(--link-color, #3b82f6);
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          text-decoration: underline;
        }

        .retry-btn:hover {
          color: var(--link-color-hover, #1d4ed8);
        }

        .spinner {
          width: 1.25rem;
          height: 1.25rem;
          border: 2px solid var(--spinner-track, #e5e7eb);
          border-top-color: var(--spinner-color, #3b82f6);
          border-radius: 50%;
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

        @media (max-width: 640px) {
          .wallet-assets {
            padding: 1rem;
          }

          .assets-header {
            flex-direction: column;
            align-items: stretch;
            gap: 0.75rem;
          }

          .assets-controls {
            justify-content: space-between;
          }

          .assets-table th,
          .assets-table td {
            padding: 0.5rem;
            font-size: 0.75rem;
          }

          .asset-name {
            gap: 0.125rem;
          }

          .symbol {
            font-size: 0.75rem;
          }

          .name {
            font-size: 0.65rem;
          }
        }
      `}</style>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg
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

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className="animate-spin"
    >
      <circle
        cx="8"
        cy="8"
        r="7"
        fill="none"
        stroke="currentColor"
        opacity="0.2"
      />
      <path
        d="M15 8a7 7 0 11-14 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        opacity="0.8"
        style={{ animation: "spin 1s linear infinite" }}
      />
    </svg>
  );
}
