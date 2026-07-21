"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortenAddress } from "@/lib/wallet";

// Check if Privy is configured
const PRIVY_ENABLED = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
const REOWN_ENABLED = Boolean(process.env.NEXT_PUBLIC_REOWN_PROJECT_ID);

// Statically import Privy hooks (safe — only invoked when PRIVY_ENABLED,
// which is exactly when <PrivyProvider> is mounted in WalletProviders).
import { usePrivy as _usePrivy, useWallets as _useWallets } from "@privy-io/react-auth";

type Toast = { kind: "success" | "error" | "info"; msg: string } | null;

export const WALLET_EXPLORER_BASE = "https://robinhoodchain.blockscout.com/address/";

export function ConnectWallet() {
  // Wagmi hooks
  const { address: wagmiAddress, status: wagmiStatus } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();

  // Privy hooks (only meaningful when PRIVY_ENABLED / provider mounted)
  const privy = PRIVY_ENABLED ? _usePrivy() : ({} as any);
  const privyWalletsResp = PRIVY_ENABLED ? _useWallets() : ({} as any);
  const privyLogin = privy.login;
  const privyAuthenticated = privy.authenticated;
  const privyLogout = privy.logout;
  const privyWallets = privyWalletsResp.wallets ?? [];

  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const wasAuthenticated = useRef(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Show a confirmation toast once Privy login completes
  useEffect(() => {
    if (PRIVY_ENABLED && privyAuthenticated && !wasAuthenticated.current) {
      wasAuthenticated.current = true;
      setToast({ kind: "success", msg: "Berhasil terhubung via Privy (email/Google)." });
    }
    if (!privyAuthenticated) wasAuthenticated.current = false;
  }, [PRIVY_ENABLED, privyAuthenticated]);

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

  // Calculate derived state
  const privyAddress = privyAuthenticated && privyWallets.length > 0
    ? privyWallets[0].address
    : null;

  const address = privyAddress || wagmiAddress || null;
  const via = privyAddress ? "privy" : (wagmiAddress ? "reown" : null);

  let status: "connected" | "disconnected" | "connecting" | "reconnecting";
  if (address) {
    status = "connected";
  } else if (wagmiStatus === "connecting" || wagmiStatus === "reconnecting") {
    status = wagmiStatus;
  } else {
    status = "disconnected";
  }

  // Connection functions
  const connectExternal = async () => {
    try {
      const connector = connectors[0];
      if (connector) await connectAsync({ connector });
    } catch {
      /* user rejected or no connector */
    }
  };

  const connectSocial = async () => {
    if (!PRIVY_ENABLED || typeof privyLogin !== "function") {
      setToast({
        kind: "error",
        msg: "Privy belum terkonfigurasi. Cek NEXT_PUBLIC_PRIVY_APP_ID & dashboard Privy.",
      });
      return;
    }
    try {
      setToast({ kind: "info", msg: "Membuka jendela login Privy…" });
      await privyLogin();
    } catch (error: any) {
      console.error("Social login failed:", error);
      const reason = error?.message ? ` (${error.message})` : "";
      setToast({ kind: "error", msg: `Login Privy gagal${reason}` });
    }
  };

  const disconnect = async () => {
    try {
      if (privyAddress && privyLogout) {
        await privyLogout();
        setToast({ kind: "info", msg: "Sesi Privy diputus." });
      } else if (wagmiAddress) {
        await disconnectAsync();
      }
    } catch (error) {
      console.error("Disconnect failed:", error);
    }
  };

  // ── Connected: show address + menu ───────────────────────────────
  if (status === "connected" && address) {
    const explorerUrl = `${WALLET_EXPLORER_BASE}${address}`;
    return (
      <div className="connect-wrap" ref={wrapRef}>
        <button
          type="button"
          className="btn connect-pill"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="connect-dot" />
          {shortenAddress(address)}
          {via ? <span className="connect-badge">{via === "privy" ? "Privy" : "RH"}</span> : null}
        </button>
        {menuOpen && (
          <div className="connect-menu">
            <button
              type="button"
              className="connect-menu-item"
              onClick={() => {
                navigator.clipboard?.writeText(address);
                setMenuOpen(false);
              }}
            >
              Salin address
            </button>
            <a
              className="connect-menu-item"
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              Lihat di explorer
            </a>
            <button
              type="button"
              className="connect-menu-item connect-danger"
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
    <div className="connect-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-primary connect-btn"
        onClick={() => setMenuOpen((v) => !v)}
      >
        <WalletIcon />
        Connect Wallet
      </button>

      {menuOpen && (
        <div className="connect-menu connect-chooser">
          {!anyEnabled && (
            <div className="connect-note">
              Wallet providers belum dikonfigurasi. Isi{" "}
              <code>NEXT_PUBLIC_REOWN_PROJECT_ID</code> /{" "}
              <code>NEXT_PUBLIC_PRIVY_APP_ID</code>.
            </div>
          )}

          {REOWN_ENABLED && (
            <button
              type="button"
              className="connect-menu-item connect-choice"
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
              className="connect-menu-item connect-choice"
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

      {toast && (
        <div className={`wallet-toast ${toast.kind}`} role="status" aria-live="polite">
          <span className="toast-dot" />
          <span>{toast.msg}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="Tutup"
            onClick={() => setToast(null)}
          >
            ×
          </button>
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
