"use client";

import { ReactNode, useMemo } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "viem";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { robinhoodViemChain, robinhoodPrivyChain } from "@/lib/chains";
import { PrivyWalletProvider, ReownWalletProvider } from "./PrivyWalletContext";

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID?.trim() ?? "";
const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://robinhoodscreener.vercel.app";

const metadata = {
  name: "Robinhood Pair Tracker",
  description: "Early/new pair token tracker for Robinhood Chain",
  url: appUrl,
  icons: ["/logo.svg"],
};

let wagmiConfig: ReturnType<typeof createConfig>;
if (projectId) {
  const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks: [robinhoodViemChain as any],
    ssr: true,
  });
  wagmiConfig = wagmiAdapter.wagmiConfig;
  // Only initialise AppKit on the client to avoid SSR incompatibilities.
  if (typeof window !== "undefined") {
    createAppKit({
      adapters: [wagmiAdapter],
      networks: [robinhoodViemChain as any],
      projectId,
      metadata,
      features: { email: false, socials: [], analytics: false },
      themeMode: "dark",
    });
  }
} else {
  wagmiConfig = createConfig({
    chains: [robinhoodViemChain],
    transports: { [robinhoodViemChain.id]: http() },
    ssr: true,
  });
}

function AppProviders({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);

  // Wrap with ReownWalletProvider only when AppKit has been initialised.
  const content = projectId ? (
    <ReownWalletProvider>{children}</ReownWalletProvider>
  ) : (
    children
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
    </WagmiProvider>
  );
}

export function WalletProviders({ children }: { children: ReactNode }) {
  // Privy rejects empty, dummy, and malformed app IDs at runtime. Do not mount
  // it at all until a real NEXT_PUBLIC_PRIVY_APP_ID is configured.
  if (!privyAppId) {
    return <AppProviders>{children}</AppProviders>;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#3d8bfd",
          logo: "/logo.svg",
        },
        supportedChains: [robinhoodPrivyChain],
        defaultChain: robinhoodPrivyChain,
        loginMethods: ["email", "google", "wallet"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          showWalletUIs: false,
        },
      }}
    >
      <PrivyWalletProvider>
        <AppProviders>{children}</AppProviders>
      </PrivyWalletProvider>
    </PrivyProvider>
  );
}
