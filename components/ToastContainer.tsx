"use client";

import { useNotificationStore } from "@/lib/store";

export function ToastContainer() {
  const { toasts, removeToast } = useNotificationStore();

  if (!toasts.length) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          onClick={() => removeToast(toast.id)}
        >
          <span className="toast-dot" />
          <div className="toast-content">
            <span className="toast-title">{toast.title}</span>
            <span className="toast-message">{toast.message}</span>
          </div>
          <button
            type="button"
            className="toast-close"
            aria-label="Tutup"
            onClick={(e) => {
              e.stopPropagation();
              removeToast(toast.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
