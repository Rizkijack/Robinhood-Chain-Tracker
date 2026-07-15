"use client";

import { ReactNode, useMemo } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "viem";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  robinhoodViemChain,
  robinhoodPrivyChain,
} from "@/lib/chains";

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";
const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000";

const metadata = {
  name: "Robinhood Pair Tracker",
  description: "Early/new pair token tracker for Robinhood Chain",
  url: appUrl,
  icons: ["/logo.svg"],
};

// Build the wagmi config. When a Reown project id is present we use the
// Reown WagmiAdapter (enables WalletConnect + the AppKit modal). Otherwise we
// fall back to a minimal wagmi config so the wagmi context still exists and the
// app renders even before keys are configured.
let wagmiConfig: ReturnType<typeof createConfig>;
if (projectId) {
  const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks: [robinhoodViemChain as any],
    ssr: true,
  });
  wagmiConfig = wagmiAdapter.wagmiConfig;
  createAppKit({
    adapters: [wagmiAdapter],
    networks: [robinhoodViemChain as any],
    projectId,
    metadata,
    features: {
      email: false,
      socials: [],
      analytics: false,
    },
    themeMode: "dark",
  });
} else {
  wagmiConfig = createConfig({
    chains: [robinhoodViemChain],
    transports: {
      [robinhoodViemChain.id]: http(),
    },
    ssr: true,
  });
}

// During build-time (static generation / SSR) there's no valid Privy key.
// We swap the Privy branch for a lightweight passthrough so the JSX tree
// stays intact without hitting the "invalid app ID" error.
const isBuildTime = typeof window === "undefined";
const dummyPrivyId = "cm-dummy-build-id";

export function WalletProviders({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {isBuildTime ? (
          children
        ) : (
          <PrivyProvider
            appId={privyAppId || dummyPrivyId}
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
            {children}
          </PrivyProvider>
        )}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
