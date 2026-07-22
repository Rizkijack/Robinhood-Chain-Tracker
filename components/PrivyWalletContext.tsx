"use client";

/**
 * PrivyWalletContext — a safe bridge between PrivyProvider and the rest of the app.
 *
 * WHY THIS EXISTS:
 * Privy hooks (usePrivy, useWallets) throw if called outside <PrivyProvider>.
 * Since <PrivyProvider> is only mounted when NEXT_PUBLIC_PRIVY_APP_ID is set,
 * any component that unconditionally calls usePrivy() will crash when Privy
 * is not configured.
 *
 * SOLUTION:
 * PrivyWalletProvider is rendered INSIDE <PrivyProvider> (so hooks are valid),
 * but the outer <PrivyProvider> is only mounted when Privy is actually enabled.
 *
 * Components that need Privy state call usePrivyWallet(), which has a safe
 * default (address=null, authenticated=false) when the provider is absent.
 *
 * ReownWalletContext follows the same pattern for useAppKit().
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useAppKit } from "@reown/appkit/react";

// ═══════════════════════════════════════════════════════════════
//  PRIVY
// ═══════════════════════════════════════════════════════════════

export interface PrivyWalletState {
  /** Connected wallet address (or null). */
  address: string | null;
  /** Whether the user is authenticated via Privy. */
  authenticated: boolean;
  /** Open the Privy login modal (email/Google/wallet). */
  login: (() => void) | null;
  /** Log out of Privy. */
  logout: (() => void) | null;
  /** Whether Privy has finished initialising. */
  ready: boolean;
}

const PrivyWalletContext = createContext<PrivyWalletState>({
  address: null,
  authenticated: false,
  login: null,
  logout: null,
  ready: false,
});

/**
 * Read the current Privy wallet state.
 *
 * This hook is **always safe to call** — when no PrivyWalletProvider
 * is mounted, it returns the default (disconnected) state instead of
 * throwing.
 */
export function usePrivyWallet(): PrivyWalletState {
  return useContext(PrivyWalletContext);
}

/**
 * Mount this INSIDE <PrivyProvider> so that usePrivy / useWallets
 * are valid.  The outer WalletProviders component decides whether
 * to mount <PrivyProvider> at all.
 */
export function PrivyWalletProvider({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const { wallets } = useWallets();

  const address =
    privy.authenticated && wallets.length > 0 ? wallets[0].address : null;

  // Stabilise the context value with useMemo to avoid cascading re-renders.
  const value = useMemo<PrivyWalletState>(
    () => ({
      address,
      authenticated: privy.authenticated,
      login: typeof privy.login === "function" ? privy.login : null,
      logout: typeof privy.logout === "function" ? privy.logout : null,
      ready: privy.ready ?? false,
    }),
    [address, privy.authenticated, privy.login, privy.logout, privy.ready]
  );

  return (
    <PrivyWalletContext.Provider value={value}>
      {children}
    </PrivyWalletContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════
//  REOWN (AppKit)
// ═══════════════════════════════════════════════════════════════

export interface ReownWalletState {
  /** Open the AppKit wallet-selection modal. */
  open: () => Promise<void>;
  /** Whether the AppKit provider is ready. */
  ready: boolean;
}

const ReownWalletContext = createContext<ReownWalletState>({
  open: async () => {
    console.warn("[Reown] AppKit not initialised — call wallet connection ignored.");
  },
  ready: false,
});

/**
 * Read the current Reown wallet state.
 *
 * Always safe — returns a no-op `open()` when ReownWalletProvider is absent.
 */
export function useReownWallet(): ReownWalletState {
  return useContext(ReownWalletContext);
}

/**
 * Mount this ONLY when createAppKit has been called (i.e. projectId is set).
 * WalletProviders handles the conditional rendering.
 */
export function ReownWalletProvider({ children }: { children: ReactNode }) {
  // useAppKit() is safe here because this component only mounts when
  // createAppKit has already been called in WalletProviders.
  const appKit = useAppKit();

  const value = useMemo<ReownWalletState>(
    () => ({
      open: async () => {
        try {
          await appKit.open();
        } catch {
          /* user closed modal or error */
        }
      },
      ready: true,
    }),
    [appKit]
  );

  return (
    <ReownWalletContext.Provider value={value}>
      {children}
    </ReownWalletContext.Provider>
  );
}
