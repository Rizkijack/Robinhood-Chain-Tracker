"use client";

import React, { useState, useRef, useEffect } from "react";
import { useMultiWalletStore, useAllWallets } from "@/lib/multi-wallet-store";
import { formatWalletAddress } from "@/lib/wallet-service";
import type { StoredWallet } from "@/lib/multi-wallet-store";

export function WalletSelector() {
  const wallets = useAllWallets();
  const activeWallet = useMultiWalletStore((state) => state.getActiveWallet());
  const setActiveWallet = useMultiWalletStore((state) => state.setActiveWallet);
  const removeWallet = useMultiWalletStore((state) => state.removeWallet);
  const updateWalletName = useMultiWalletStore(
    (state) => state.updateWalletName
  );

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (wallets.length === 0) {
    return null;
  }

  const handleEditStart = (wallet: StoredWallet) => {
    setEditingId(wallet.id);
    setEditName(wallet.name);
  };

  const handleEditSave = (id: string) => {
    if (editName.trim()) {
      updateWalletName(id, editName.trim());
    }
    setEditingId(null);
  };

  const handleSelectWallet = (id: string) => {
    setActiveWallet(id);
    setIsOpen(false);
  };

  return (
    <div className="wallet-selector" ref={menuRef}>
      <button
        type="button"
        className="wallet-selector-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label={`${activeWallet?.name || "Select wallet"} (${wallets.length} total)`}
      >
        <WalletIcon />
        <span className="wallet-name">{activeWallet?.name || "Select Wallet"}</span>
        {wallets.length > 1 && (
          <span className="wallet-count">{wallets.length}</span>
        )}
        <ChevronIcon className={isOpen ? "open" : ""} />
      </button>

      {isOpen && (
        <div className="wallet-selector-menu">
          <div className="wallet-list">
            {wallets.map((wallet) => (
              <div key={wallet.id} className="wallet-item">
                <button
                  type="button"
                  className={`wallet-item-btn ${
                    wallet.isActive ? "active" : ""
                  }`}
                  onClick={() => handleSelectWallet(wallet.id)}
                >
                  <div className="wallet-item-content">
                    {editingId === wallet.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="wallet-name-input"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleEditSave(wallet.id);
                          } else if (e.key === "Escape") {
                            setEditingId(null);
                          }
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="wallet-item-info">
                        <span className="wallet-item-name">{wallet.name}</span>
                        <span className="wallet-item-address">
                          {formatWalletAddress(wallet.address)}
                        </span>
                        <span className={`wallet-via-tag ${wallet.via}`}>
                          {wallet.via === "privy" ? "Privy" : "External"}
                        </span>
                      </div>
                    )}
                  </div>
                  {wallet.isActive && (
                    <span className="active-indicator">✓</span>
                  )}
                </button>

                <div className="wallet-item-actions">
                  {editingId === wallet.id ? (
                    <>
                      <button
                        type="button"
                        className="action-btn save"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditSave(wallet.id);
                        }}
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="action-btn cancel"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(null);
                        }}
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="action-btn edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditStart(wallet);
                        }}
                        title="Edit name"
                      >
                        ✎
                      </button>
                      {wallets.length > 1 && (
                        <button
                          type="button"
                          className="action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeWallet(wallet.id);
                            if (wallet.isActive) {
                              setIsOpen(false);
                            }
                          }}
                          title="Remove wallet"
                        >
                          ✕
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="wallet-selector-footer">
            <p className="total-wallets">
              Total: {wallets.length} wallet{wallets.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      )}

      <style jsx>{`
        .wallet-selector {
          position: relative;
        }

        .wallet-selector-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
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

        .wallet-selector-btn:hover {
          background: var(--button-bg-hover, #e5e7eb);
          border-color: var(--border-color-hover, #d1d5db);
        }

        .wallet-selector-btn:active {
          transform: scale(0.98);
        }

        .wallet-selector-btn svg {
          width: 1rem;
          height: 1rem;
        }

        .wallet-name {
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .wallet-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.25rem;
          height: 1.25rem;
          padding: 0;
          margin-left: 0.25rem;
          background: var(--primary-color, #3b82f6);
          color: white;
          border-radius: 50%;
          font-size: 0.65rem;
          font-weight: 700;
        }

        .wallet-selector-menu {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          z-index: 50;
          min-width: 320px;
          background: var(--card-bg, #ffffff);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.75rem;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .wallet-list {
          max-height: 400px;
          overflow-y: auto;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .wallet-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
          transition: background-color 0.2s ease;
        }

        .wallet-item:hover {
          background: var(--table-row-hover-bg, #f9fafb);
        }

        .wallet-item:last-child {
          border-bottom: none;
        }

        .wallet-item-btn {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0;
          border: none;
          background: none;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s ease;
        }

        .wallet-item-btn.active {
          font-weight: 600;
        }

        .wallet-item-btn:hover {
          color: var(--primary-color, #3b82f6);
        }

        .wallet-item-content {
          flex: 1;
          min-width: 0;
        }

        .wallet-item-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .wallet-item-name {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-primary, #111827);
        }

        .wallet-item-address {
          font-size: 0.75rem;
          color: var(--text-secondary, #6b7280);
          font-family: monospace;
        }

        .wallet-via-tag {
          display: inline-flex;
          width: fit-content;
          padding: 0.125rem 0.375rem;
          background: var(--badge-bg, #e5e7eb);
          color: var(--badge-text, #374151);
          font-size: 0.65rem;
          font-weight: 600;
          border-radius: 9999px;
          text-transform: uppercase;
          margin-top: 0.25rem;
        }

        .wallet-via-tag.privy {
          background: var(--privy-badge-bg, #dbeafe);
          color: var(--privy-badge-text, #0c4a6e);
        }

        .wallet-via-tag.reown {
          background: var(--reown-badge-bg, #f3e8ff);
          color: var(--reown-badge-text, #5b21b6);
        }

        .active-indicator {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.25rem;
          height: 1.25rem;
          background: var(--primary-color, #3b82f6);
          color: white;
          border-radius: 50%;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .wallet-item-actions {
          display: flex;
          gap: 0.25rem;
          align-items: center;
        }

        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.75rem;
          height: 1.75rem;
          padding: 0;
          border: none;
          background: var(--action-btn-bg, #f0f0f0);
          color: var(--text-primary, #111827);
          cursor: pointer;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          transition: all 0.2s ease;
        }

        .action-btn:hover {
          background: var(--action-btn-bg-hover, #e5e7eb);
        }

        .action-btn.delete:hover {
          background: var(--error-bg, #fee2e2);
          color: var(--error-text, #991b1b);
        }

        .action-btn.save:hover {
          background: var(--success-bg, #dcfce7);
          color: var(--success-text, #166534);
        }

        .wallet-name-input {
          padding: 0.375rem 0.5rem;
          border: 1px solid var(--primary-color, #3b82f6);
          border-radius: 0.375rem;
          font-size: 0.875rem;
          width: 100%;
        }

        .wallet-name-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px var(--primary-color-light, #dbeafe);
        }

        .wallet-selector-footer {
          padding: 0.75rem;
          background: var(--card-bg-alt, #f9fafb);
          border-top: 1px solid var(--border-color, #e5e7eb);
          text-align: center;
        }

        .total-wallets {
          margin: 0;
          font-size: 0.75rem;
          color: var(--text-secondary, #6b7280);
          font-weight: 500;
        }

        @media (max-width: 640px) {
          .wallet-selector-btn {
            padding: 0.375rem 0.5rem;
            font-size: 0.75rem;
          }

          .wallet-name {
            max-width: 80px;
          }

          .wallet-selector-menu {
            min-width: 280px;
            right: -4px;
          }

          .wallet-item {
            padding: 0.5rem;
            gap: 0.375rem;
          }

          .action-btn {
            width: 1.5rem;
            height: 1.5rem;
            font-size: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}

function WalletIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2z" />
      <circle cx="17" cy="13" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transition: "transform 0.2s ease" }}
    >
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  );
}
