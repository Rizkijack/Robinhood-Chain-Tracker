"use client";

import dynamic from "next/dynamic";
import { EXTERNAL_LINKS } from "@/lib/constants";
import { useFeedStore, useFilterStore, useUiStore } from "@/lib/store";
import { ErrorBoundary } from "./ErrorBoundary";

// Lazy-load ConnectWallet — pulls in Privy/Wagmi/viem only when needed
const ConnectWallet = dynamic(
  () => import("./ConnectWallet").then((m) => m.ConnectWallet),
  { ssr: false, loading: () => <span className="muted" style={{fontSize:11}}>Wallet...</span> }
);

export function Header() {
  const { searchInput, setSearchInput, onSearchSubmit, tab, query, setTab } = useFilterStore();
  const { autoRefresh, toggleAutoRefresh } = useUiStore();
  const { loadFeed, loadStats } = useFeedStore();

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!searchInput.trim()) {
      setTab("new");
    } else {
      onSearchSubmit();
    }
  }

  function handleRefresh() {
    loadFeed(tab, query);
    loadStats();
  }

  return (
    <header className="header">
      <div className="container header-inner">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <div className="brand-name">
              Robinhood<span>Tracker</span>
            </div>
            <div className="brand-sub">RH Chain · ID 4663</div>
          </div>
        </div>

        <a href="/" className="home-btn" title="Kembali ke halaman utama" aria-label="Home">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Home
        </a>

        <form className="search-wrap" onSubmit={handleSearchSubmit}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            className="search"
            type="search"
            placeholder="Cari token, pair, atau address..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            autoComplete="off"
          />
        </form>

        <div className="header-right">
          <div className="ext-links">
            <a href={EXTERNAL_LINKS.dexscreenerNew} target="_blank" rel="noreferrer">
              New Pairs
            </a>
            <a href={EXTERNAL_LINKS.birdeye} target="_blank" rel="noreferrer">
              Birdeye
            </a>
            <a href={EXTERNAL_LINKS.robinhoodChain} target="_blank" rel="noreferrer">
              RH Chain
            </a>
          </div>
          <button
            type="button"
            className={`btn live-toggle ${autoRefresh ? "is-live" : "is-paused"}`}
            onClick={toggleAutoRefresh}
            aria-pressed={autoRefresh}
          >
            <span className="dot" />
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRefresh}
          >
            Refresh
          </button>
          <ErrorBoundary fallback={<span className="muted" style={{fontSize:11}}>Wallet err</span>}>
            <ConnectWallet />
          </ErrorBoundary>
        </div>
      </div>
    </header>
  );
}
