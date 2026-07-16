/**
 * Notification service for toasts and system alerts.
 * Provides type-safe notifications with auto-dismissal.
 */

import { create } from "zustand";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number; // in ms, 0 = no auto-dismiss
  action?: {
    label: string;
    onClick: () => void;
  };
  createdAt: number;
}

interface NotificationStore {
  notifications: Notification[];
  add: (notification: Omit<Notification, "id" | "createdAt">) => string;
  remove: (id: string) => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],

  add: (notification) => {
    const id = `notif-${Date.now()}-${Math.random()}`;
    const duration = notification.duration ?? 5000;

    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          ...notification,
          id,
          createdAt: Date.now(),
        },
      ],
    }));

    // Auto-dismiss if duration is set
    if (duration > 0) {
      setTimeout(() => {
        get().remove(id);
      }, duration);
    }

    return id;
  },

  remove: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clear: () => {
    set({ notifications: [] });
  },
}));

/**
 * Hook to access notification store.
 */
export function useNotifications() {
  return useNotificationStore((state) => state.notifications);
}

/**
 * Helper functions for common notification types.
 */
export const notificationService = {
  success: (title: string, message?: string, duration = 3000) => {
    return useNotificationStore.getState().add({
      type: "success",
      title,
      message,
      duration,
    });
  },

  error: (title: string, message?: string, duration = 5000) => {
    return useNotificationStore.getState().add({
      type: "error",
      title,
      message,
      duration,
    });
  },

  warning: (title: string, message?: string, duration = 4000) => {
    return useNotificationStore.getState().add({
      type: "warning",
      title,
      message,
      duration,
    });
  },

  info: (title: string, message?: string, duration = 3000) => {
    return useNotificationStore.getState().add({
      type: "info",
      title,
      message,
      duration,
    });
  },

  // Transaction-specific notifications
  transactionPending: (txHash: string) => {
    return useNotificationStore.getState().add({
      type: "info",
      title: "Transaction Pending",
      message: `Hash: ${txHash}`,
      duration: 0, // No auto-dismiss
    });
  },

  transactionSuccess: (txHash: string) => {
    return useNotificationStore.getState().add({
      type: "success",
      title: "Transaction Confirmed",
      message: `Hash: ${txHash}`,
      duration: 5000,
    });
  },

  transactionFailed: (error: string) => {
    return useNotificationStore.getState().add({
      type: "error",
      title: "Transaction Failed",
      message: error,
      duration: 6000,
    });
  },

  walletConnected: (address: string) => {
    return useNotificationStore.getState().add({
      type: "success",
      title: "Wallet Connected",
      message: `Address: ${address.slice(0, 6)}...${address.slice(-4)}`,
      duration: 3000,
    });
  },

  walletDisconnected: () => {
    return useNotificationStore.getState().add({
      type: "info",
      title: "Wallet Disconnected",
      duration: 2000,
    });
  },

  // Balance-specific notifications
  balanceUpdated: (amount: string, symbol: string) => {
    return useNotificationStore.getState().add({
      type: "success",
      title: "Balance Updated",
      message: `New balance: ${amount} ${symbol}`,
      duration: 2000,
    });
  },

  // Error notifications
  connectionError: (error: string) => {
    return useNotificationStore.getState().add({
      type: "error",
      title: "Connection Error",
      message: error,
      duration: 5000,
    });
  },
};
