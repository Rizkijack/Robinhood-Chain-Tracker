import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WhaleWallet, WhaleAlertConfig, WhaleTransaction } from "../types";

interface WhaleState {
  // Whale transactions
  transactions: WhaleTransaction[];
  txLoading: boolean;
  txError: string | null;

  // Watched wallets (persisted)
  watchedWallets: WhaleWallet[];

  // Alert configs (persisted)
  alertConfigs: WhaleAlertConfig[];

  // Wallet detail view
  activeWallet: string | null;

  // Actions
  fetchTransactions: () => Promise<void>;
  fetchWalletActivity: (address: string) => Promise<WhaleTransaction[]>;
  addWatchedWallet: (wallet: WhaleWallet) => void;
  removeWatchedWallet: (address: string) => void;
  updateWatchedWallet: (address: string, updates: Partial<WhaleWallet>) => void;
  addAlertConfig: (config: WhaleAlertConfig) => void;
  updateAlertConfig: (id: string, updates: Partial<WhaleAlertConfig>) => void;
  removeAlertConfig: (id: string) => void;
  setActiveWallet: (address: string | null) => void;
}

const DEFAULT_ALERT: WhaleAlertConfig = {
  id: "default",
  enabled: true,
  minUsd: 10_000,
  tokenAddress: null,
  entityName: null,
  type: "all",
  notifyVia: "both",
};

export const useWhaleStore = create<WhaleState>()(
  persist(
    (set, get) => ({
      // --- defaults ---
      transactions: [],
      txLoading: false,
      txError: null,
      watchedWallets: [],
      alertConfigs: [DEFAULT_ALERT],
      activeWallet: null,

      // --- fetch whale transactions ---
      fetchTransactions: async () => {
        set({ txLoading: true, txError: null });
        try {
          const res = await fetch("/api/whales");
          const data = await res.json();
          if (data.error && !data.transactions?.length) {
            set({ txError: data.error });
          } else {
            set({ transactions: data.transactions || [], txError: null });
          }
        } catch (e) {
          set({ txError: String(e) });
        } finally {
          set({ txLoading: false });
        }
      },

      // --- fetch individual wallet activity ---
      fetchWalletActivity: async (address: string) => {
        try {
          const res = await fetch(`/api/whales/wallet/${address}`);
          const data = await res.json();
          return data.transactions || [];
        } catch {
          return [];
        }
      },

      // --- watched wallets ---
      addWatchedWallet: (wallet) =>
        set((state) => {
          if (state.watchedWallets.some((w) => w.address === wallet.address)) return state;
          return { watchedWallets: [...state.watchedWallets, wallet] };
        }),

      removeWatchedWallet: (address) =>
        set((state) => ({
          watchedWallets: state.watchedWallets.filter((w) => w.address !== address),
        })),

      updateWatchedWallet: (address, updates) =>
        set((state) => ({
          watchedWallets: state.watchedWallets.map((w) =>
            w.address === address ? { ...w, ...updates } : w
          ),
        })),

      // --- alert configs ---
      addAlertConfig: (config) =>
        set((state) => ({ alertConfigs: [...state.alertConfigs, config] })),

      updateAlertConfig: (id, updates) =>
        set((state) => ({
          alertConfigs: state.alertConfigs.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      removeAlertConfig: (id) =>
        set((state) => ({
          alertConfigs: state.alertConfigs.filter((c) => c.id !== id),
        })),

      // --- active views ---
      setActiveWallet: (address) => set({ activeWallet: address }),
    }),
    {
      name: "rh-whale",
      partialize: (state) => ({
        watchedWallets: state.watchedWallets,
        alertConfigs: state.alertConfigs,
      }),
    }
  )
);
