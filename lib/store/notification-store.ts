import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration?: number;
}

export interface NotificationSettings {
  /** Browser push notifications for new pairs */
  newPairAlerts: boolean;
  /** Browser push notifications for price spikes */
  priceSpikeAlerts: boolean;
  /** In-app toast notifications (always shown regardless of browser permission) */
  toastAlerts: boolean;
  /** Minimum price change % to trigger a spike alert */
  spikeThresholdPct: number;
  /** Notification permission status */
  permission: NotificationPermission;
  /** Whether the user has been prompted for permission */
  hasPrompted: boolean;
}

interface NotificationState extends NotificationSettings {
  /** Toast queue for in-app display */
  toasts: Toast[];

  setNewPairAlerts: (enabled: boolean) => void;
  setPriceSpikeAlerts: (enabled: boolean) => void;
  setToastAlerts: (enabled: boolean) => void;
  setSpikeThresholdPct: (pct: number) => void;
  setPermission: (perm: NotificationPermission) => void;
  setHasPrompted: (prompted: boolean) => void;

  /** Add a toast to the queue */
  addToast: (toast: Omit<Toast, "id">) => void;
  /** Remove a toast from the queue */
  removeToast: (id: string) => void;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  newPairAlerts: true,
  priceSpikeAlerts: true,
  toastAlerts: true,
  spikeThresholdPct: 10,
  permission: "default",
  hasPrompted: false,
};

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      toasts: [],

      setNewPairAlerts: (enabled) => set({ newPairAlerts: enabled }),
      setPriceSpikeAlerts: (enabled) => set({ priceSpikeAlerts: enabled }),
      setToastAlerts: (enabled) => set({ toastAlerts: enabled }),
      setSpikeThresholdPct: (pct) => set({ spikeThresholdPct: pct }),
      setPermission: (perm) => set({ permission: perm }),
      setHasPrompted: (prompted) => set({ hasPrompted: prompted }),

      addToast: (toast) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const fullToast: Toast = {
          ...toast,
          id,
          duration: toast.duration ?? 5000,
        };
        set((state) => ({
          toasts: [...state.toasts.slice(-9), fullToast],
        }));

        // Auto-dismiss
        if (fullToast.duration > 0) {
          setTimeout(() => {
            get().removeToast(id);
          }, fullToast.duration);
        }
      },
      removeToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),
    }),
    {
      name: "rh-notifications",
      partialize: (state) => ({
        newPairAlerts: state.newPairAlerts,
        priceSpikeAlerts: state.priceSpikeAlerts,
        toastAlerts: state.toastAlerts,
        spikeThresholdPct: state.spikeThresholdPct,
        hasPrompted: state.hasPrompted,
      }),
    }
  )
);
