"use client";

import { useState, useEffect } from "react";

interface TransactionCountProps {
  pairAddress: string;
  tokenAddress: string;
  initialCount?: number;
}

export function TransactionCount({ 
  pairAddress, 
  tokenAddress,
  initialCount = 0 
}: TransactionCountProps) {
  const [transactionCount, setTransactionCount] = useState(initialCount);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchTransactionCount = async () => {
    if (!tokenAddress && !pairAddress) return;
    
    setIsLoading(true);
    try {
      const addressToUse = tokenAddress || pairAddress;
      const params = new URLSearchParams();
      if (pairAddress && addressToUse !== pairAddress) params.set("pairAddress", pairAddress);
      const qs = params.toString();
      const response = await fetch(`/api/token/${addressToUse}/transactions${qs ? `?${qs}` : ""}`);
      
      if (response.ok) {
        const data = await response.json();
        setTransactionCount(data.count || 0);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch transaction count:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchTransactionCount();
    
    // Poll every 15 seconds for real-time updates
    const intervalId = setInterval(fetchTransactionCount, 15000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [tokenAddress, pairAddress]);

  return (
    <div className="transaction-count-container">
      <button
        className={`transaction-count-button ${isLoading ? 'loading' : ''}`}
        onClick={fetchTransactionCount}
        title={lastUpdate ? `Last updated: ${lastUpdate.toLocaleTimeString()}` : 'Click to refresh'}
      >
        <span className="transaction-count-number">
          {isLoading ? '...' : transactionCount}
        </span>
        <span className="transaction-count-label">txns</span>
      </button>
    </div>
  );
}