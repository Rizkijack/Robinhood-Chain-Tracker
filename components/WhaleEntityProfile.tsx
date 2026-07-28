"use client";

import { useState, useEffect, useCallback } from "react";
import { formatUsd, formatAge, shortAddr } from "@/lib/format";
import type { WhaleTransaction } from "@/lib/types";

interface WhaleEntityProfileProps {
  entityName: string;
  onClose: () => void;
  onSelectToken?: (address: string) => void;
}

export function WhaleEntityProfile({
  entityName,
  onClose,
  onSelectToken,
}: WhaleEntityProfileProps) {
  const [transactions, setTransactions] = useState<WhaleTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntity = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/whales/entity/${encodeURIComponent(entityName)}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setTransactions(data.transactions || []);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [entityName]);

  useEffect(() => {
    fetchEntity();
  }, [fetchEntity]);

  const totalVolume = transactions.reduce((sum, tx) => sum + tx.usdValue, 0);
  const buyVolume = transactions.filter((t) => t.type === "buy").reduce((s, t) => s + t.usdValue, 0);
  const sellVolume = transactions.filter((t) => t.type === "sell").reduce((s, t) => s + t.usdValue, 0);
  const entityLogo = transactions[0]?.entityLogo || null;

  return (
    <div className="whale-entity-profile">
      <div className="whale-entity-header">
        <div className="whale-entity-info">
          {entityLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entityLogo} alt="" className="whale-entity-logo" width={28} height={28} />
          )}
          <div>
            <div className="whale-entity-name">{entityName}</div>
            <div className="whale-entity-meta">
              {transactions.length} transactions · {formatUsd(totalVolume)} total volume
            </div>
          </div>
        </div>
        <button type="button" className="whale-entity-close" onClick={onClose}>
          ×
        </button>
      </div>

      {/* Volume breakdown */}
      <div className="whale-entity-volumes">
        <div className="whale-entity-vol">
          <span className="whale-entity-vol-label">Buy Volume</span>
          <span className="whale-entity-vol-value positive">{formatUsd(buyVolume)}</span>
        </div>
        <div className="whale-entity-vol">
          <span className="whale-entity-vol-label">Sell Volume</span>
          <span className="whale-entity-vol-value negative">{formatUsd(sellVolume)}</span>
        </div>
      </div>

      {/* Recent transactions */}
      {isLoading ? (
        <div className="whale-entity-loading">Loading entity data…</div>
      ) : error ? (
        <div className="whale-entity-error">{error}</div>
      ) : (
        <div className="whale-entity-txs">
          {transactions.slice(0, 15).map((tx) => (
            <div key={tx.hash} className={`whale-entity-tx whale-type-${tx.type}`}>
              <span className="whale-entity-tx-type">
                {tx.type === "buy" ? "⊕" : tx.type === "sell" ? "⊖" : "↔"}
              </span>
              <span
                className="whale-entity-tx-token clickable"
                onClick={() => tx.tokenAddress && onSelectToken?.(tx.tokenAddress)}
                role={onSelectToken ? "button" : undefined}
              >
                {tx.tokenSymbol}
              </span>
              <span className="whale-entity-tx-amount">{formatUsd(tx.usdValue)}</span>
              <span className="whale-entity-tx-time">
                {formatAge(Date.now() - tx.timestamp)} ago
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Arkham platform link */}
      <a
        href={`https://platform.arkhamintelligence.com/entity/${encodeURIComponent(entityName)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="whale-entity-link"
      >
        View on Arkham Intelligence →
      </a>
    </div>
  );
}
