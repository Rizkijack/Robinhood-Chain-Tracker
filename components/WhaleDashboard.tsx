"use client";

import { useEffect, useRef } from "react";
import { useWhaleStore, useNotificationStore } from "@/lib/store";
import { WhaleFeed } from "./WhaleFeed";
import { WhaleFlowChart } from "./WhaleFlowChart";
import { WhaleWalletTracker } from "./WhaleWalletTracker";
import { WhaleEntityProfile } from "./WhaleEntityProfile";
import { WhaleNotificationCenter } from "./WhaleNotificationCenter";

const POLL_INTERVAL = 15_000; // 15s

export function WhaleDashboard() {
  const {
    transactions,
    txLoading,
    txError,
    flowData,
    flowLoading,
    activeEntity,
    setActiveEntity,
    fetchTransactions,
    fetchFlowData,
    alertConfigs,
  } = useWhaleStore();

  const { addToast, toastAlerts } = useNotificationStore();
  const lastHashRef = useRef<string | null>(null);

  // Polling for whale transactions
  useEffect(() => {
    fetchTransactions();
    fetchFlowData();

    const txInterval = setInterval(fetchTransactions, POLL_INTERVAL);
    const flowInterval = setInterval(fetchFlowData, 60_000); // flow every 60s

    return () => {
      clearInterval(txInterval);
      clearInterval(flowInterval);
    };
  }, [fetchTransactions, fetchFlowData]);

  // Whale alert notifications
  useEffect(() => {
    if (!transactions.length || !alertConfigs.length) return;

    const latest = transactions[0];
    if (!latest || latest.hash === lastHashRef.current) return;
    lastHashRef.current = latest.hash;

    // Check against alert configs
    for (const config of alertConfigs) {
      if (!config.enabled) continue;
      if (latest.usdValue < config.minUsd) continue;
      if (config.type !== "all" && latest.type !== config.type) continue;
      if (config.entityName && latest.entity !== config.entityName) continue;
      if (config.tokenAddress && latest.tokenAddress !== config.tokenAddress) continue;

      const entityLabel = latest.entity || "Unknown";
      const typeLabel = latest.type === "buy" ? "bought" : latest.type === "sell" ? "sold" : "transferred";

      if (toastAlerts && (config.notifyVia === "toast" || config.notifyVia === "both")) {
        addToast({
          type: "warning",
          title: `🐋 Whale Alert: ${latest.tokenSymbol}`,
          message: `${entityLabel} ${typeLabel} $${(latest.usdValue / 1000).toFixed(1)}K of ${latest.tokenSymbol}`,
          duration: 8000,
        });
      }

      if (config.notifyVia === "browser" || config.notifyVia === "both") {
        try {
          if (Notification.permission === "granted") {
            new Notification(`🐋 Whale: ${latest.tokenSymbol}`, {
              body: `${entityLabel} ${typeLabel} $${(latest.usdValue / 1000).toFixed(1)}K`,
              icon: "/logo.svg",
            });
          }
        } catch {
          // Notification API may not be available
        }
      }

      break; // fire first matching alert only
    }
  }, [transactions, alertConfigs, addToast, toastAlerts]);

  return (
    <div className="whale-dashboard">
      {/* Left column: Whale Feed */}
      <div className="whale-dashboard-feed">
        <WhaleFeed
          transactions={transactions}
          isLoading={txLoading}
          error={txError}
          onRefresh={fetchTransactions}
          onSelectEntity={setActiveEntity}
        />
      </div>

      {/* Center column: Flow Chart + Entity Profile */}
      <div className="whale-dashboard-center">
        <WhaleFlowChart flowData={flowData} isLoading={flowLoading} />

        {activeEntity && (
          <WhaleEntityProfile
            entityName={activeEntity}
            onClose={() => setActiveEntity(null)}
          />
        )}
      </div>

      {/* Right column: Wallet Tracker + Alert Settings */}
      <div className="whale-dashboard-sidebar">
        <WhaleWalletTracker />
        <WhaleNotificationCenter />
      </div>
    </div>
  );
}
