"use client";

import React, { useState } from "react";
import { useWalletContext } from "./WalletContext";
import {
  validateTransaction,
  estimateTransactionGas,
  parseTransactionError,
  buildExplorerUrl,
  type TransactionConfig,
} from "@/lib/transaction-service";
import { formatWalletAddress } from "@/lib/wallet-service";

export function SendTransaction() {
  const { address, balance } = useWalletContext();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [estimate, setEstimate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!address) {
    return (
      <div className="send-transaction send-empty">
        <p>Connect wallet to send transactions</p>
      </div>
    );
  }

  const handleEstimateGas = async () => {
    setError(null);
    setEstimate(null);

    const validation = validateTransaction({
      from: address,
      to: recipient,
      value: amount,
    });

    if (!validation.valid) {
      setError(validation.error || "Invalid transaction");
      return;
    }

    setIsLoading(true);
    try {
      const est = await estimateTransactionGas({
        from: address,
        to: recipient,
        value: amount,
      });

      if (est) {
        setEstimate(est);
        setShowConfirm(true);
      } else {
        setError("Failed to estimate gas");
      }
    } catch (err) {
      const txError = parseTransactionError(err);
      setError(txError.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendTransaction = async () => {
    if (!estimate) {
      setError("Please estimate gas first");
      return;
    }

    // Note: Actual transaction sending would be implemented here
    // with wallet provider integration (Privy or Wagmi)
    console.log("[SendTransaction] Sending transaction...", {
      from: address,
      to: recipient,
      amount,
      estimate,
    });

    setError(
      "Transaction sending is currently in demo mode. Full integration requires wallet provider setup."
    );
  };

  const handleMaxAmount = () => {
    if (balance) {
      // Keep some for gas
      const gasEstimate = Number(estimate?.totalCost || 0.01);
      const maxAmount = Math.max(
        Number(balance.formatted) - gasEstimate,
        0
      );
      setAmount(maxAmount.toFixed(6));
    }
  };

  const amountNum = Number(amount) || 0;
  const balanceNum = balance ? Number(balance.formatted) : 0;
  const totalCost = Number(estimate?.totalCost || 0) + amountNum;
  const hasInsufficientBalance = totalCost > balanceNum;

  return (
    <div className="send-transaction">
      <h3>Send Transaction</h3>

      {txHash && (
        <div className="tx-success">
          <h4>Transaction Sent!</h4>
          <p>Transaction hash:</p>
          <code>{txHash}</code>
          <a
            href={buildExplorerUrl(txHash)}
            target="_blank"
            rel="noreferrer"
            className="explorer-link"
          >
            View on Explorer →
          </a>
          <button
            type="button"
            onClick={() => {
              setTxHash(null);
              setRecipient("");
              setAmount("");
              setEstimate(null);
            }}
            className="btn-secondary"
          >
            Send Another
          </button>
        </div>
      )}

      {!txHash && (
        <>
          {error && <div className="error-box">{error}</div>}

          <div className="form-group">
            <label>Recipient Address</label>
            <input
              type="text"
              placeholder="0x..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={showConfirm}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>
              Amount ({balance?.symbol})
              {balance && (
                <span className="balance-display">
                  Balance: {balance.formatted}
                </span>
              )}
            </label>
            <div className="amount-input-group">
              <input
                type="number"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={showConfirm}
                className="form-input"
                step="0.000001"
                min="0"
              />
              {balance && (
                <button
                  type="button"
                  onClick={handleMaxAmount}
                  disabled={showConfirm || !estimate}
                  className="btn-max"
                >
                  Max
                </button>
              )}
            </div>
          </div>

          {estimate && (
            <div className="gas-estimate">
              <div className="estimate-row">
                <span>Send Amount:</span>
                <strong>{amount} {balance?.symbol}</strong>
              </div>
              <div className="estimate-row">
                <span>Gas Fee:</span>
                <strong>{estimate.totalCost} {balance?.symbol}</strong>
              </div>
              <div className="estimate-row total">
                <span>Total Cost:</span>
                <strong>{totalCost.toFixed(8)} {balance?.symbol}</strong>
              </div>
              {hasInsufficientBalance && (
                <p className="insufficient-warning">
                  Insufficient balance
                </p>
              )}
            </div>
          )}

          {showConfirm && (
            <div className="confirmation-box">
              <h4>Confirm Transaction</h4>
              <div className="confirm-details">
                <p>
                  <strong>To:</strong> {formatWalletAddress(recipient)}
                </p>
                <p>
                  <strong>Amount:</strong> {amount} {balance?.symbol}
                </p>
                <p>
                  <strong>Total:</strong> {totalCost.toFixed(8)} {balance?.symbol}
                </p>
              </div>
              <div className="button-group">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="btn-secondary"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSendTransaction}
                  disabled={hasInsufficientBalance || isLoading}
                  className="btn-primary"
                >
                  {isLoading ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          )}

          {!showConfirm && (
            <button
              type="button"
              onClick={handleEstimateGas}
              disabled={isLoading || !recipient || !amount}
              className="btn-primary"
            >
              {isLoading ? "Estimating..." : "Estimate Gas & Review"}
            </button>
          )}
        </>
      )}

      <style jsx>{`
        .send-transaction {
          padding: 1.5rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.75rem;
          background: var(--card-bg, #ffffff);
          max-width: 500px;
        }

        .send-empty {
          text-align: center;
          padding: 2rem 1.5rem;
          background: var(--card-bg-alt, #f9fafb);
          border: 2px dashed var(--border-color, #e5e7eb);
          border-radius: 0.5rem;
          color: var(--text-secondary, #6b7280);
        }

        h3 {
          margin: 0 0 1.5rem 0;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        h4 {
          margin: 0 0 1rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .error-box {
          padding: 0.75rem;
          background: var(--error-bg, #fef2f2);
          border: 1px solid var(--error-border, #fecaca);
          border-radius: 0.5rem;
          color: var(--error-text, #991b1b);
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-primary, #111827);
        }

        .balance-display {
          font-size: 0.75rem;
          color: var(--text-secondary, #6b7280);
          font-weight: normal;
        }

        .form-input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          color: var(--text-primary, #111827);
          background: var(--input-bg, #ffffff);
          transition: all 0.2s ease;
        }

        .form-input:focus {
          outline: none;
          border-color: var(--primary-color, #3b82f6);
          box-shadow: 0 0 0 2px var(--primary-color-light, #dbeafe);
        }

        .form-input:disabled {
          background: var(--input-bg-disabled, #f9fafb);
          color: var(--text-secondary, #6b7280);
          cursor: not-allowed;
        }

        .amount-input-group {
          display: flex;
          gap: 0.5rem;
        }

        .amount-input-group .form-input {
          flex: 1;
        }

        .btn-max {
          padding: 0.75rem 1rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.5rem;
          background: var(--button-bg, #f3f4f6);
          color: var(--text-primary, #111827);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .btn-max:hover:not(:disabled) {
          background: var(--button-bg-hover, #e5e7eb);
          border-color: var(--border-color-hover, #d1d5db);
        }

        .btn-max:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .gas-estimate {
          padding: 1rem;
          background: var(--card-bg-alt, #f9fafb);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }

        .estimate-row {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .estimate-row:last-child {
          border-bottom: none;
        }

        .estimate-row.total {
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          font-weight: 600;
        }

        .insufficient-warning {
          margin: 0.75rem 0 0 0;
          padding: 0.5rem;
          background: var(--warning-bg, #fef3c7);
          color: var(--warning-text, #92400e);
          border-radius: 0.375rem;
          font-size: 0.75rem;
        }

        .confirmation-box {
          padding: 1rem;
          background: var(--confirm-bg, #f0f9ff);
          border: 2px solid var(--primary-color, #3b82f6);
          border-radius: 0.5rem;
          margin-bottom: 1rem;
        }

        .confirm-details {
          margin: 1rem 0;
          padding: 0.75rem;
          background: var(--card-bg, #ffffff);
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }

        .confirm-details p {
          margin: 0.5rem 0;
          display: flex;
          justify-content: space-between;
        }

        .button-group {
          display: flex;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .button-group button {
          flex: 1;
        }

        .btn-primary,
        .btn-secondary {
          padding: 0.75rem 1rem;
          border: none;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-primary {
          width: 100%;
          background: var(--primary-color, #3b82f6);
          color: white;
          margin-top: 1rem;
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--primary-color-dark, #1d4ed8);
          transform: translateY(-1px);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: var(--button-bg, #f3f4f6);
          color: var(--text-primary, #111827);
          border: 1px solid var(--border-color, #e5e7eb);
        }

        .btn-secondary:hover {
          background: var(--button-bg-hover, #e5e7eb);
        }

        .tx-success {
          padding: 1rem;
          background: var(--success-bg, #dcfce7);
          border: 1px solid var(--success-border, #86efac);
          border-radius: 0.5rem;
          text-align: center;
        }

        .tx-success p {
          margin: 0.5rem 0;
          color: var(--success-text, #166534);
          font-size: 0.875rem;
        }

        code {
          display: block;
          padding: 0.75rem;
          margin: 0.5rem 0;
          background: var(--card-bg, #ffffff);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.375rem;
          font-family: monospace;
          font-size: 0.75rem;
          color: var(--text-primary, #111827);
          word-break: break-all;
        }

        .explorer-link {
          display: inline-block;
          margin: 0.75rem 0;
          color: var(--link-color, #3b82f6);
          text-decoration: none;
          font-weight: 500;
        }

        .explorer-link:hover {
          text-decoration: underline;
        }

        @media (max-width: 640px) {
          .send-transaction {
            padding: 1rem;
          }

          .confirm-details p {
            flex-direction: column;
            gap: 0.25rem;
          }

          .button-group {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
