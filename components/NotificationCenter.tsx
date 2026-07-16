"use client";

import React, { useEffect, useState } from "react";
import { useNotifications, useNotificationStore } from "@/lib/notification-service";
import type { Notification } from "@/lib/notification-service";

export function NotificationCenter() {
  const notifications = useNotifications();
  const remove = useNotificationStore((state) => state.remove);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="notification-center" role="region" aria-live="polite" aria-label="Notifications">
      <div className="notifications-container">
        {notifications.map((notif) => (
          <NotificationToast
            key={notif.id}
            notification={notif}
            onClose={() => remove(notif.id)}
          />
        ))}
      </div>

      <style jsx>{`
        .notification-center {
          position: fixed;
          top: 0;
          right: 0;
          z-index: 9999;
          pointer-events: none;
        }

        .notifications-container {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem;
          pointer-events: auto;
        }

        @media (max-width: 640px) {
          .notification-center {
            left: 0;
            right: 0;
          }

          .notifications-container {
            padding: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}

interface NotificationToastProps {
  notification: Notification;
  onClose: () => void;
}

function NotificationToast({
  notification,
  onClose,
}: NotificationToastProps) {
  const { type, title, message, action } = notification;

  return (
    <div className={`notification-toast notification-${type}`}>
      <div className="toast-content">
        <div className="toast-header">
          <span className="toast-icon">{getIcon(type)}</span>
          <span className="toast-title">{title}</span>
        </div>
        {message && <p className="toast-message">{message}</p>}
      </div>

      <div className="toast-actions">
        {action && (
          <button
            type="button"
            className="toast-action-btn"
            onClick={() => {
              action.onClick();
              onClose();
            }}
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          className="toast-close-btn"
          onClick={onClose}
          aria-label="Close notification"
        >
          ✕
        </button>
      </div>

      <style jsx>{`
        .notification-toast {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 1rem;
          background: white;
          border-left: 4px solid var(--border-color, #e5e7eb);
          border-radius: 0.5rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          animation: slideInRight 0.3s ease-out;
          max-width: 400px;
          min-width: 280px;
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideOutRight {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(100%);
          }
        }

        .notification-toast.notification-success {
          border-left-color: var(--success-color, #16a34a);
          background: var(--success-bg-light, #f0fdf4);
        }

        .notification-toast.notification-error {
          border-left-color: var(--error-color, #dc2626);
          background: var(--error-bg-light, #fef2f2);
        }

        .notification-toast.notification-warning {
          border-left-color: var(--warning-color, #ea580c);
          background: var(--warning-bg-light, #fef3c7);
        }

        .notification-toast.notification-info {
          border-left-color: var(--info-color, #0284c7);
          background: var(--info-bg-light, #f0f9ff);
        }

        .toast-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .toast-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .toast-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.25rem;
          height: 1.25rem;
          flex-shrink: 0;
          font-size: 1rem;
          line-height: 1;
        }

        .notification-success .toast-icon {
          color: var(--success-color, #16a34a);
        }

        .notification-error .toast-icon {
          color: var(--error-color, #dc2626);
        }

        .notification-warning .toast-icon {
          color: var(--warning-color, #ea580c);
        }

        .notification-info .toast-icon {
          color: var(--info-color, #0284c7);
        }

        .toast-title {
          font-weight: 600;
          font-size: 0.875rem;
          color: var(--text-primary, #111827);
        }

        .notification-success .toast-title {
          color: var(--success-color, #16a34a);
        }

        .notification-error .toast-title {
          color: var(--error-color, #dc2626);
        }

        .notification-warning .toast-title {
          color: var(--warning-color, #ea580c);
        }

        .notification-info .toast-title {
          color: var(--info-color, #0284c7);
        }

        .toast-message {
          margin: 0;
          font-size: 0.75rem;
          color: var(--text-secondary, #6b7280);
          line-height: 1.4;
          word-break: break-word;
        }

        .toast-actions {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          flex-shrink: 0;
        }

        .toast-action-btn {
          padding: 0.375rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 600;
          border: none;
          border-radius: 0.375rem;
          cursor: pointer;
          background: transparent;
          color: var(--link-color, #3b82f6);
          transition: all 0.2s ease;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .toast-action-btn:hover {
          background: rgba(59, 130, 246, 0.1);
        }

        .toast-close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.5rem;
          height: 1.5rem;
          padding: 0;
          border: none;
          border-radius: 0.375rem;
          background: transparent;
          color: var(--text-secondary, #6b7280);
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 1rem;
          line-height: 1;
        }

        .toast-close-btn:hover {
          background: rgba(0, 0, 0, 0.05);
          color: var(--text-primary, #111827);
        }

        @media (max-width: 640px) {
          .notification-toast {
            max-width: none;
            min-width: auto;
          }
        }
      `}</style>
    </div>
  );
}

function getIcon(type: string): string {
  switch (type) {
    case "success":
      return "✓";
    case "error":
      return "✕";
    case "warning":
      return "⚠";
    case "info":
      return "ℹ";
    default:
      return "•";
  }
}
