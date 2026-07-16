/**
 * Zustand store for portfolio tracking and position management.
 * Tracks wallet positions, transactions, gains/losses, and statistics.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PortfolioPosition {
  id: string;
  walletAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  quantity: string; // in wei or decimal
  averageCostPerUnit: string; // in USD
  totalCostBasis: string; // in USD
  currentValue: string; // in USD
  unrealizedGain: string; // in USD
  unrealizedGainPercent: number;
  acquiredAt: number; // timestamp
}

export interface PortfolioTransaction {
  id: string;
  walletAddress: string;
  txHash: string;
  type: "buy" | "sell" | "swap" | "receive" | "send";
  tokenIn?: {
    symbol: string;
    amount: string;
    value: string;
  };
  tokenOut?: {
    symbol: string;
    amount: string;
    value: string;
  };
  fee?: string; // in USD
  date: number; // timestamp
  status: "pending" | "confirmed" | "failed";
}

export interface PortfolioStats {
  totalValue: string; // in USD
  totalCostBasis: string; // in USD
  realizedGain: string; // in USD
  realizedGainPercent: number;
  unrealizedGain: string; // in USD
  unrealizedGainPercent: number;
  totalReturn: string; // in USD
  totalReturnPercent: number;
}

interface PortfolioStore {
  // State
  positions: PortfolioPosition[];
  transactions: PortfolioTransaction[];
  selectedWalletAddress: string | null;

  // Actions
  addPosition: (position: Omit<PortfolioPosition, "id">) => void;
  updatePosition: (id: string, updates: Partial<PortfolioPosition>) => void;
  removePosition: (id: string) => void;
  addTransaction: (tx: Omit<PortfolioTransaction, "id">) => void;
  updateTransaction: (
    id: string,
    updates: Partial<PortfolioTransaction>
  ) => void;
  removeTransaction: (id: string) => void;
  setSelectedWallet: (address: string | null) => void;
  clearPortfolio: (walletAddress?: string) => void;

  // Selectors
  getPositions: (walletAddress?: string) => PortfolioPosition[];
  getPosition: (id: string) => PortfolioPosition | undefined;
  getTransactions: (walletAddress?: string) => PortfolioTransaction[];
  getStats: (walletAddress?: string) => PortfolioStats;
}

export const usePortfolioStore = create<PortfolioStore>()(
  persist(
    (set, get) => ({
      positions: [],
      transactions: [],
      selectedWalletAddress: null,

      addPosition: (position) => {
        set((state) => {
          const id = `${position.walletAddress}-${position.tokenAddress}-${Date.now()}`;
          return {
            positions: [
              ...state.positions,
              {
                ...position,
                id,
              },
            ],
          };
        });
      },

      updatePosition: (id, updates) => {
        set((state) => ({
          positions: state.positions.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
      },

      removePosition: (id) => {
        set((state) => ({
          positions: state.positions.filter((p) => p.id !== id),
        }));
      },

      addTransaction: (tx) => {
        set((state) => {
          const id = `${tx.walletAddress}-${tx.txHash}`;
          return {
            transactions: [
              ...state.transactions,
              {
                ...tx,
                id,
              },
            ],
          };
        });
      },

      updateTransaction: (id, updates) => {
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));
      },

      removeTransaction: (id) => {
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
        }));
      },

      setSelectedWallet: (address) => {
        set({ selectedWalletAddress: address });
      },

      clearPortfolio: (walletAddress) => {
        set((state) => {
          if (!walletAddress) {
            return {
              positions: [],
              transactions: [],
              selectedWalletAddress: null,
            };
          }

          return {
            positions: state.positions.filter(
              (p) => p.walletAddress !== walletAddress
            ),
            transactions: state.transactions.filter(
              (t) => t.walletAddress !== walletAddress
            ),
          };
        });
      },

      getPositions: (walletAddress) => {
        const positions = get().positions;
        if (!walletAddress) return positions;
        return positions.filter((p) => p.walletAddress === walletAddress);
      },

      getPosition: (id) => {
        return get().positions.find((p) => p.id === id);
      },

      getTransactions: (walletAddress) => {
        const transactions = get().transactions;
        if (!walletAddress) return transactions;
        return transactions.filter((t) => t.walletAddress === walletAddress);
      },

      getStats: (walletAddress) => {
        const positions = get().getPositions(walletAddress);

        const totalValue = positions.reduce(
          (acc, p) => acc + Number(p.currentValue || 0),
          0
        );

        const totalCostBasis = positions.reduce(
          (acc, p) => acc + Number(p.totalCostBasis || 0),
          0
        );

        const unrealizedGain = totalValue - totalCostBasis;
        const unrealizedGainPercent =
          totalCostBasis > 0 ? (unrealizedGain / totalCostBasis) * 100 : 0;

        // Simplified realized gain calculation
        const transactions = get().getTransactions(walletAddress);
        const realizedGain = transactions
          .filter((t) => t.type === "sell")
          .reduce((acc, t) => acc + Number(t.tokenOut?.value || 0), 0);

        const totalCostOfSells = transactions
          .filter((t) => t.type === "sell")
          .reduce((acc, t) => acc + Number(t.tokenIn?.value || 0), 0);

        const realizedGainPercent =
          totalCostOfSells > 0
            ? ((realizedGain - totalCostOfSells) / totalCostOfSells) * 100
            : 0;

        const totalReturn = unrealizedGain + realizedGain;
        const totalReturnPercent =
          totalCostBasis > 0 ? (totalReturn / totalCostBasis) * 100 : 0;

        return {
          totalValue: totalValue.toFixed(2),
          totalCostBasis: totalCostBasis.toFixed(2),
          realizedGain: realizedGain.toFixed(2),
          realizedGainPercent,
          unrealizedGain: unrealizedGain.toFixed(2),
          unrealizedGainPercent,
          totalReturn: totalReturn.toFixed(2),
          totalReturnPercent,
        };
      },
    }),
    {
      name: "portfolio-store",
      version: 1,
    }
  )
);

/**
 * Hook to get portfolio positions for a wallet.
 */
export function usePortfolioPositions(walletAddress?: string) {
  return usePortfolioStore((state) =>
    walletAddress
      ? state.getPositions(walletAddress)
      : state.getPositions()
  );
}

/**
 * Hook to get portfolio statistics.
 */
export function usePortfolioStats(walletAddress?: string) {
  return usePortfolioStore((state) =>
    walletAddress ? state.getStats(walletAddress) : state.getStats()
  );
}

/**
 * Hook to get portfolio transactions.
 */
export function usePortfolioTransactions(walletAddress?: string) {
  return usePortfolioStore((state) =>
    walletAddress
      ? state.getTransactions(walletAddress)
      : state.getTransactions()
  );
}
