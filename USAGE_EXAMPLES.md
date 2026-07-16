# Wallet Integration - Usage Examples

Complete examples for integrating the wallet system into your Robinhood Chain Tracker.

## Basic Setup

### Wrap Your App with Providers

In your `app/layout.tsx`:

```tsx
import { WalletProviders } from "@/components/WalletProviders";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <WalletProviders>
          {children}
        </WalletProviders>
      </body>
    </html>
  );
}
```

## Example 1: Simple Wallet Connect Button

```tsx
"use client";

import { useWallet } from "@/components/useWallet";

export function SimpleConnectButton() {
  const { address, status, connectExternal, disconnect } = useWallet();

  if (address) {
    return (
      <div>
        <p>Connected: {address.slice(0, 6)}...{address.slice(-4)}</p>
        <button onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <button 
      onClick={connectExternal}
      disabled={status === "connecting"}
    >
      {status === "connecting" ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
```

## Example 2: Display Balance with Auto-Refresh

```tsx
"use client";

import { WalletContextProvider, useWalletBalance } from "@/components/WalletProviders";

function BalanceDisplay() {
  const { balance, balanceLoading, balanceError, refreshBalance } = useWalletBalance();

  if (balanceError) {
    return <div className="text-red-500">Error: {balanceError}</div>;
  }

  if (balanceLoading) {
    return <div className="animate-pulse">Loading balance...</div>;
  }

  if (!balance) {
    return <div>No wallet connected</div>;
  }

  return (
    <div className="p-4 border rounded">
      <h3 className="text-lg font-semibold">Your Balance</h3>
      <p className="text-2xl font-bold">{balance.formatted} {balance.symbol}</p>
      <p className="text-sm text-gray-500">{balance.address}</p>
      <button 
        onClick={refreshBalance}
        className="mt-2 px-3 py-1 bg-blue-500 text-white rounded"
      >
        Refresh
      </button>
    </div>
  );
}

export function BalanceWidget() {
  return (
    <WalletContextProvider>
      <BalanceDisplay />
    </WalletContextProvider>
  );
}
```

## Example 3: Multi-Wallet Dashboard

```tsx
"use client";

import { WalletContextProvider } from "@/components/WalletProviders";
import { WalletSelector } from "@/components/WalletSelector";
import { WalletBalance } from "@/components/WalletBalance";
import { WalletAssets } from "@/components/WalletAssets";
import { PortfolioOverview } from "@/components/PortfolioOverview";

export function WalletDashboard() {
  return (
    <WalletContextProvider>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-6">
        {/* Wallet Selection */}
        <div className="lg:col-span-1">
          <WalletSelector />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Balance Summary */}
          <WalletBalance />

          {/* Portfolio Overview */}
          <PortfolioOverview />

          {/* Assets Table */}
          <WalletAssets />
        </div>
      </div>
    </WalletContextProvider>
  );
}
```

## Example 4: Send Transaction Form

```tsx
"use client";

import { WalletContextProvider } from "@/components/WalletProviders";
import { SendTransaction } from "@/components/SendTransaction";

export function TransactionPage() {
  return (
    <WalletContextProvider>
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Send Transaction</h1>
        <SendTransaction />
      </div>
    </WalletContextProvider>
  );
}
```

## Example 5: Complete Tracker Integration

```tsx
"use client";

import { useState } from "react";
import { WalletContextProvider, useWalletContext } from "@/components/WalletProviders";
import { WalletBalance } from "@/components/WalletBalance";
import { WalletAssets } from "@/components/WalletAssets";
import { SendTransaction } from "@/components/SendTransaction";
import { PortfolioOverview } from "@/components/PortfolioOverview";
import { NotificationCenter } from "@/components/NotificationCenter";

function TrackerContent() {
  const { address, status, connectExternal } = useWalletContext();
  const [activeTab, setActiveTab] = useState<"overview" | "assets" | "send">("overview");

  if (!address) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <button
          onClick={connectExternal}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold"
          disabled={status === "connecting"}
        >
          {status === "connecting" ? "Connecting..." : "Connect Wallet to Start"}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Notifications */}
      <NotificationCenter />

      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Robinhood Chain Tracker</h1>
            <div className="text-sm text-gray-600">
              Connected: {address.slice(0, 6)}...{address.slice(-4)}
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab("overview")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "overview"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("assets")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "assets"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Assets
            </button>
            <button
              onClick={() => setActiveTab("send")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "send"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <WalletBalance />
            <PortfolioOverview />
          </div>
        )}

        {activeTab === "assets" && (
          <div>
            <WalletAssets />
          </div>
        )}

        {activeTab === "send" && (
          <div className="max-w-2xl">
            <SendTransaction />
          </div>
        )}
      </div>
    </div>
  );
}

export function CompleteDashboard() {
  return (
    <WalletContextProvider>
      <TrackerContent />
    </WalletContextProvider>
  );
}
```

## Example 6: Custom Wallet Hook Usage

```tsx
"use client";

import { useWallet } from "@/components/useWallet";

export function CustomWalletUI() {
  const {
    address,
    via,
    status,
    walletCount,
    connectExternal,
    connectSocial,
    disconnect,
  } = useWallet();

  return (
    <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold">Connection Status</label>
          <p className="text-lg capitalize">{status}</p>
        </div>

        {address && (
          <>
            <div>
              <label className="text-sm font-semibold">Address</label>
              <code className="block bg-gray-100 p-2 rounded text-sm break-all">
                {address}
              </code>
            </div>

            <div>
              <label className="text-sm font-semibold">Provider</label>
              <p className="capitalize">{via}</p>
            </div>

            <div>
              <label className="text-sm font-semibold">Wallets Connected</label>
              <p>{walletCount}</p>
            </div>
          </>
        )}

        <div className="flex gap-2 flex-wrap">
          {!address && (
            <>
              <button
                onClick={connectExternal}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                disabled={status === "connecting"}
              >
                Connect External Wallet
              </button>
              <button
                onClick={connectSocial}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                disabled={status === "connecting"}
              >
                Connect with Email/Social
              </button>
            </>
          )}

          {address && (
            <button
              onClick={disconnect}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

## Example 7: Accessing Portfolio Data

```tsx
"use client";

import { usePortfolioStore } from "@/lib/portfolio-store";

export function PortfolioStats() {
  const { currentPortfolio, portfolioHistory, calculateStats } = usePortfolioStore();

  if (!currentPortfolio) {
    return <div>No portfolio data available</div>;
  }

  const stats = calculateStats();

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Portfolio Statistics</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 rounded">
          <p className="text-sm text-gray-600">Total Value</p>
          <p className="text-2xl font-bold">${stats.totalValue.toFixed(2)}</p>
        </div>

        <div className="p-4 bg-green-50 rounded">
          <p className="text-sm text-gray-600">Total Gain/Loss</p>
          <p className={`text-2xl font-bold ${stats.totalGainLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
            ${stats.totalGainLoss.toFixed(2)}
          </p>
        </div>

        <div className="p-4 bg-purple-50 rounded">
          <p className="text-sm text-gray-600">Return %</p>
          <p className={`text-2xl font-bold ${stats.returnPercentage >= 0 ? "text-green-600" : "text-red-600"}`}>
            {stats.returnPercentage.toFixed(2)}%
          </p>
        </div>

        <div className="p-4 bg-orange-50 rounded">
          <p className="text-sm text-gray-600">Positions</p>
          <p className="text-2xl font-bold">{currentPortfolio.positions.length}</p>
        </div>
      </div>

      <h3 className="text-xl font-semibold mt-6">Recent Transactions</h3>
      <div className="space-y-2">
        {portfolioHistory.slice(0, 5).map((tx, i) => (
          <div key={i} className="p-3 border rounded text-sm">
            <div className="flex justify-between">
              <span className="font-semibold">{tx.type.toUpperCase()}</span>
              <span>{new Date(tx.timestamp).toLocaleDateString()}</span>
            </div>
            <p className="text-gray-600">${tx.amount.toFixed(2)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Example 8: Notification Handling

```tsx
"use client";

import { useEffect } from "react";
import { useNotificationStore } from "@/lib/notification-service";
import { useWalletContext } from "@/components/WalletProviders";

export function WalletEventHandler() {
  const { address, status } = useWalletContext();
  const { addNotification } = useNotificationStore();

  useEffect(() => {
    if (status === "connected" && address) {
      addNotification({
        type: "success",
        title: "Wallet Connected",
        message: `Connected to ${address.slice(0, 6)}...${address.slice(-4)}`,
      });
    }
  }, [address, status, addNotification]);

  return null; // This component just handles side effects
}
```

## Tips & Best Practices

1. **Always wrap components with WalletContextProvider** when using useWalletContext
2. **Use useWallet hook directly** for lower-level control
3. **Handle loading and error states** in your UI
4. **Refresh balance periodically** for real-time updates
5. **Validate addresses** before sending transactions
6. **Use type exports** from the services for TypeScript support
7. **Combine with your existing TrackerApp** for seamless integration
8. **Add error boundaries** around wallet components

All examples are production-ready and follow React best practices!
