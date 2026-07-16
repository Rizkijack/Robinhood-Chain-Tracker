/**
 * Zustand store for managing multiple wallets.
 * Tracks active wallet, wallet list, and wallet metadata.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface StoredWallet {
  id: string; // unique identifier (address-based or uuid)
  address: string;
  via: "privy" | "reown";
  name: string; // custom name set by user
  addedAt: number; // timestamp
  lastUsed: number; // timestamp
  isActive: boolean;
  metadata?: {
    chainId?: number;
    walletType?: string; // e.g., "MetaMask", "Privy"
  };
}

interface MultiWalletStore {
  // State
  wallets: StoredWallet[];
  activeWalletId: string | null;

  // Actions
  addWallet: (wallet: Omit<StoredWallet, "id" | "addedAt">) => void;
  removeWallet: (id: string) => void;
  setActiveWallet: (id: string) => void;
  updateWalletName: (id: string, name: string) => void;
  updateWalletLastUsed: (id: string) => void;
  clearWallets: () => void;

  // Selectors
  getWallet: (id: string) => StoredWallet | undefined;
  getActiveWallet: () => StoredWallet | null;
  getWalletByAddress: (address: string) => StoredWallet | undefined;
  getWalletsByVia: (via: "privy" | "reown") => StoredWallet[];
}

export const useMultiWalletStore = create<MultiWalletStore>()(
  persist(
    (set, get) => ({
      wallets: [],
      activeWalletId: null,

      addWallet: (wallet) => {
        set((state) => {
          // Check if wallet already exists
          const existingIndex = state.wallets.findIndex(
            (w) => w.address.toLowerCase() === wallet.address.toLowerCase()
          );

          if (existingIndex !== -1) {
            // Update last used if already exists
            const updated = [...state.wallets];
            updated[existingIndex].lastUsed = Date.now();
            return { wallets: updated };
          }

          // Generate ID based on address
          const id = `${wallet.via}-${wallet.address}`;

          const newWallet: StoredWallet = {
            ...wallet,
            id,
            addedAt: Date.now(),
            lastUsed: Date.now(),
            isActive: state.wallets.length === 0, // First wallet is active
          };

          // If this is the first wallet, set it as active
          if (state.wallets.length === 0) {
            return {
              wallets: [newWallet],
              activeWalletId: id,
            };
          }

          return {
            wallets: [...state.wallets, newWallet],
          };
        });
      },

      removeWallet: (id) => {
        set((state) => {
          const updated = state.wallets.filter((w) => w.id !== id);
          let newActiveId = state.activeWalletId;

          // If removed wallet was active, set new active wallet
          if (state.activeWalletId === id && updated.length > 0) {
            newActiveId = updated[0].id;
          } else if (updated.length === 0) {
            newActiveId = null;
          }

          return {
            wallets: updated,
            activeWalletId: newActiveId,
          };
        });
      },

      setActiveWallet: (id) => {
        set((state) => {
          // Verify wallet exists
          if (!state.wallets.find((w) => w.id === id)) {
            console.warn(`[MultiWalletStore] Wallet ${id} not found`);
            return state;
          }

          // Update all wallets' isActive status
          const updated = state.wallets.map((w) => ({
            ...w,
            isActive: w.id === id,
            lastUsed: w.id === id ? Date.now() : w.lastUsed,
          }));

          return {
            wallets: updated,
            activeWalletId: id,
          };
        });
      },

      updateWalletName: (id, name) => {
        set((state) => {
          const updated = state.wallets.map((w) =>
            w.id === id ? { ...w, name } : w
          );
          return { wallets: updated };
        });
      },

      updateWalletLastUsed: (id) => {
        set((state) => {
          const updated = state.wallets.map((w) =>
            w.id === id ? { ...w, lastUsed: Date.now() } : w
          );
          return { wallets: updated };
        });
      },

      clearWallets: () => {
        set({
          wallets: [],
          activeWalletId: null,
        });
      },

      getWallet: (id) => {
        return get().wallets.find((w) => w.id === id);
      },

      getActiveWallet: () => {
        const activeId = get().activeWalletId;
        if (!activeId) return null;
        return get().wallets.find((w) => w.id === activeId) || null;
      },

      getWalletByAddress: (address) => {
        return get().wallets.find(
          (w) => w.address.toLowerCase() === address.toLowerCase()
        );
      },

      getWalletsByVia: (via) => {
        return get().wallets.filter((w) => w.via === via);
      },
    }),
    {
      name: "multi-wallet-store", // localStorage key
      version: 1,
    }
  )
);

/**
 * Hook to get active wallet from store.
 */
export function useActiveWallet() {
  return useMultiWalletStore((state) => state.getActiveWallet());
}

/**
 * Hook to get all wallets from store.
 */
export function useAllWallets() {
  return useMultiWalletStore((state) => state.wallets);
}

/**
 * Hook to get wallet by address.
 */
export function useWalletByAddress(address: string) {
  return useMultiWalletStore((state) => state.getWalletByAddress(address));
}
