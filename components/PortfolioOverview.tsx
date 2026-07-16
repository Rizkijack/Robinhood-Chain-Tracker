"use client";

import React from "react";
import { useWalletContext } from "./WalletContext";
import { usePortfolioStats, usePortfolioPositions } from "@/lib/portfolio-store";

export function PortfolioOverview() {
  const { address } = useWalletContext();
  const stats = usePortfolioStats(address || undefined);
  const positions = usePortfolioPositions(address || undefined);

  if (!address) {
    return (
      <div className="portfolio-overview portfolio-empty">
        <p>Connect wallet to view portfolio</p>
      </div>
    );
  }

  const totalValue = Number(stats.totalValue);
  const totalCostBasis = Number(stats.totalCostBasis);
  const unrealizedGain = Number(stats.unrealizedGain);
  const isPositive = unrealizedGain >= 0;

  return (
    <div className="portfolio-overview">
      <h3>Portfolio Overview</h3>

      <div className="portfolio-summary">
        <div className="summary-card">
          <label>Total Portfolio Value</label>
          <div className="summary-value">${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <small>Cost basis: ${totalCostBasis.toLocaleString()}</small>
        </div>

        <div className="summary-card">
          <label>Unrealized P&L</label>
          <div className={`summary-value ${isPositive ? "positive" : "negative"}`}>
            ${Math.abs(unrealizedGain).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <small>
            {isPositive ? "+" : "-"}
            {Math.abs(stats.unrealizedGainPercent).toFixed(2)}%
          </small>
        </div>

        <div className="summary-card">
          <label>Holdings</label>
          <div className="summary-value">{positions.length}</div>
          <small>unique assets</small>
        </div>
      </div>

      {positions.length === 0 && (
        <div className="empty-state">
          <p>No positions tracked yet</p>
          <small>Add transactions to track your portfolio</small>
        </div>
      )}

      {positions.length > 0 && (
        <div className="positions-preview">
          <h4>Top Holdings</h4>
          <div className="positions-list">
            {positions.slice(0, 5).map((position) => {
              const posValue = Number(position.currentValue || 0);
              const posGain = Number(position.unrealizedGain || 0);
              const posGainPercent = position.unrealizedGainPercent;
              const isPosPositive = posGain >= 0;

              return (
                <div key={position.id} className="position-item">
                  <div className="position-info">
                    <span className="position-symbol">
                      {position.tokenSymbol}
                    </span>
                    <span className="position-quantity">
                      {position.quantity}
                    </span>
                  </div>
                  <div className="position-value">
                    <span className="value">
                      ${posValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`gain ${isPosPositive ? "positive" : "negative"}`}>
                      {isPosPositive ? "+" : ""}{posGainPercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {positions.length > 5 && (
            <small className="more-holdings">
              +{positions.length - 5} more holdings
            </small>
          )}
        </div>
      )}

      <style jsx>{`
        .portfolio-overview {
          padding: 1.5rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.75rem;
          background: var(--card-bg, #ffffff);
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .portfolio-empty {
          text-align: center;
          padding: 2rem 1.5rem;
          background: var(--card-bg-alt, #f9fafb);
          border: 2px dashed var(--border-color, #e5e7eb);
          border-radius: 0.5rem;
          color: var(--text-secondary, #6b7280);
        }

        h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        h4 {
          margin: 0 0 1rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .portfolio-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
        }

        .summary-card {
          padding: 1rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.5rem;
          background: var(--card-bg-alt, #f9fafb);
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .summary-card label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
          text-transform: uppercase;
          letter-spacing: 0.025em;
          margin: 0;
        }

        .summary-value {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-primary, #111827);
          font-family: monospace;
        }

        .summary-value.positive {
          color: var(--success-color, #16a34a);
        }

        .summary-value.negative {
          color: var(--error-color, #dc2626);
        }

        .summary-card small {
          font-size: 0.75rem;
          color: var(--text-secondary, #6b7280);
        }

        .empty-state {
          text-align: center;
          padding: 2rem 1rem;
          background: var(--card-bg-alt, #f9fafb);
          border: 1px dashed var(--border-color, #e5e7eb);
          border-radius: 0.5rem;
          color: var(--text-secondary, #6b7280);
        }

        .empty-state p {
          margin: 0;
          font-size: 0.875rem;
        }

        .empty-state small {
          font-size: 0.75rem;
          display: block;
          margin-top: 0.25rem;
        }

        .positions-preview {
          border-top: 1px solid var(--border-color, #e5e7eb);
          padding-top: 1rem;
        }

        .positions-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .position-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: var(--card-bg-alt, #f9fafb);
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }

        .position-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .position-symbol {
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .position-quantity {
          font-size: 0.75rem;
          color: var(--text-secondary, #6b7280);
          font-family: monospace;
        }

        .position-value {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
        }

        .position-value .value {
          font-weight: 600;
          font-family: monospace;
          color: var(--text-primary, #111827);
        }

        .position-value .gain {
          font-size: 0.75rem;
          font-weight: 500;
        }

        .gain.positive {
          color: var(--success-color, #16a34a);
        }

        .gain.negative {
          color: var(--error-color, #dc2626);
        }

        .more-holdings {
          display: block;
          margin-top: 0.75rem;
          text-align: center;
          color: var(--link-color, #3b82f6);
          font-weight: 500;
        }

        @media (max-width: 640px) {
          .portfolio-overview {
            padding: 1rem;
            gap: 1rem;
          }

          .portfolio-summary {
            grid-template-columns: 1fr;
          }

          .summary-value {
            font-size: 1rem;
          }

          .position-item {
            padding: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
}
