export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import "./styles/base.css";
import "./styles/header.css";
import "./styles/stats.css";
import "./styles/controls.css";
import "./styles/table.css";
import "./styles/meta.css";
import "./styles/footer.css";
import "./styles/states.css";
import "./styles/modal.css";
import "./styles/wallet.css";
import "./styles/dapp.css";
import "./styles/responsive.css";
import { WalletProviders } from "@/components/WalletProviders";

// ── Font configuration ─────────────────────────────────────────

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  fallback: ["Segoe UI", "system-ui", "-apple-system", "sans-serif"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  fallback: ["Cascadia Code", "Consolas", "Courier New", "monospace"],
  weight: ["400", "500", "600", "700"],
});

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <WalletProviders>{children}</WalletProviders>
      </body>
    </html>
  );
}
