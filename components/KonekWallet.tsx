"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet, WALLET_EXPLORER_BASE } from "./useWallet";
import { shortenAddress } from "@/lib/wallet";

const REOWN_ENABLED = Boolean(process.env.NEXT_PUBLIC_REOWN_PROJECT_ID);
const PRIVY_ENABLED = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export function KonekWallet() {
  const {
    address,
    via,
    status,
    connectExternal,
    connectSocial,
    disconnect,
  } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  // ── Connected: show address + menu ───────────────────────────────
  if (status === "connected" && address) {
    const explorerUrl = `${WALLET_EXPLORER_BASE}${address}`;
    return (
      <div className="konek-wrap" ref={wrapRef}>
        <button
          type="button"
          className="btn konek-pill"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="konek-dot" />
          {shortenAddress(address)}
          {via ? <span className="konek-badge">{via === "privy" ? "Privy" : "RH"}</span> : null}
        </button>
        {menuOpen && (
          <div className="konek-menu">
            <button
              type="button"
              className="konek-menu-item"
              onClick={() => {
                navigator.clipboard?.writeText(address);
                setMenuOpen(false);
              }}
            >
              Salin address
            </button>
            <a
              className="konek-menu-item"
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              Lihat di explorer
            </a>
            <button
              type="button"
              className="konek-menu-item konek-danger"
              onClick={() => {
                disconnect();
                setMenuOpen(false);
              }}
            >
              Putus sambungan
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Not connected: chooser popover ───────────────────────────────
  const anyEnabled = REOWN_ENABLED || PRIVY_ENABLED;

  return (
    <div className="konek-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-primary konek-btn"
        onClick={() => setMenuOpen((v) => !v)}
      >
        <WalletIcon />
        Konek Wallet
      </button>

      {menuOpen && (
        <div className="konek-menu konek-chooser">
          {!anyEnabled && (
            <div className="konek-note">
              Wallet providers belum dikonfigurasi. Isi{" "}
              <code>NEXT_PUBLIC_REOWN_PROJECT_ID</code> /{" "}
              <code>NEXT_PUBLIC_PRIVY_APP_ID</code>.
            </div>
          )}

          {REOWN_ENABLED && (
            <button
              type="button"
              className="konek-menu-item konek-choice"
              onClick={() => {
                setMenuOpen(false);
                connectExternal();
              }}
            >
              <PlugIcon />
              <span>
                <strong>Dompet luaran</strong>
                <small>MetaMask, Rabby, WalletConnect &amp; lainnya</small>
              </span>
            </button>
          )}

          {PRIVY_ENABLED && (
            <button
              type="button"
              className="konek-menu-item konek-choice"
              onClick={() => {
                setMenuOpen(false);
                connectSocial();
              }}
            >
              <MailIcon />
              <span>
                <strong>Email / Google</strong>
                <small>Privy — dompet terbenam (embedded)</small>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function WalletIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2z" />
      <circle cx="17" cy="13" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0z" />
      <path d="M12 16v6" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
