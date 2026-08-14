export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Script from "next/script";

import "./globals.css";
import "./styles/base.css";
import "./styles/header.css";
import "./styles/stats.css";
import "./styles/controls.css";
import "./styles/table.css";
import "./styles/cardview.css";
import "./styles/meta.css";
import "./styles/footer.css";
import "./styles/states.css";
import "./styles/modal.css";
import "./styles/wallet.css";
import "./styles/dapp.css";
import "./styles/notifications.css";
import "./styles/responsive.css";
import "./styles/features.css";
import "./styles/whale-dashboard.css";
import "./styles/launchpad.css";
import { WalletProviders } from "@/components/WalletProviders";

// ── Font configuration ─────────────────────────────────────────
// Fonts are system-stack only. We intentionally do NOT use
// next/font/google: the build fetches the woff2 files from
// fonts.gstatic.com, which hangs/crashes `next build` on networks
// where Google Fonts is unreachable. The --font-inter/--font-mono
// variables below are the same names next/font used to expose, so
// existing CSS keeps working with graceful system-font fallbacks.

export const metadata: Metadata = {
  title: "Robinhood Pair Tracker — Early & New Tokens",
  description:
    "Track early/new pair tokens on Robinhood Chain (L2) Mainnet via GeckoTerminal, DexScreener, Birdeye and major DEXes.",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
  appleWebApp: {
    capable: true,
    title: "RH Tracker",
    statusBarStyle: "black-translucent",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0c1017" />
      </head>
      <body>
        <WalletProviders>
          {children}
          <KeyboardShortcuts />
        </WalletProviders>
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
