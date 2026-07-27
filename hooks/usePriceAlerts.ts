"use client";

import { useEffect, useState, useCallback } from "react";

export interface PriceAlertRule {
  id: string;
  tokenSymbol: string;
  tokenAddress: string;
  condition: "above" | "below" | "change_up" | "change_down";
  threshold: number;
  createdAt: number;
}

interface PriceAlert {
  id: string;
  rule: PriceAlertRule;
  message: string;
  triggeredAt: number;
}

interface UsePriceAlertsReturn {
  rules: PriceAlertRule[];
  alerts: PriceAlert[];
  addRule: (rule: Omit<PriceAlertRule, "id" | "createdAt">) => void;
  removeRule: (id: string) => void;
  dismissAlert: (id: string) => void;
  checkPrices: (prices: Record<string, number>) => void;
}

const STORAGE_KEY = "rh-price-alerts";

export function usePriceAlerts(): UsePriceAlertsReturn {
  const [rules, setRules] = useState<PriceAlertRule[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRules(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    } catch {
      // ignore
    }
  }, [rules]);

  const addRule = useCallback((rule: Omit<PriceAlertRule, "id" | "createdAt">) => {
    const newRule: PriceAlertRule = {
      ...rule,
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };
    setRules((prev) => [...prev, newRule]);
  }, []);

  const removeRule = useCallback((id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const checkPrices = useCallback(
    (prices: Record<string, number>) => {
      const newAlerts: PriceAlert[] = [];

      for (const rule of rules) {
        const currentPrice = prices[rule.tokenAddress];
        if (currentPrice == null) continue;

        let triggered = false;
        let message = "";

        switch (rule.condition) {
          case "above":
            if (currentPrice >= rule.threshold) {
              triggered = true;
              message = `${rule.tokenSymbol} is now at $${currentPrice.toFixed(6)} (above $${rule.threshold.toFixed(6)})`;
            }
            break;
          case "below":
            if (currentPrice <= rule.threshold) {
              triggered = true;
              message = `${rule.tokenSymbol} dropped to $${currentPrice.toFixed(6)} (below $${rule.threshold.toFixed(6)})`;
            }
            break;
          case "change_up":
          case "change_down":
            // These would need previous price data — simplified for now
            break;
        }

        if (triggered) {
          // Don't duplicate alerts for the same rule within 5 minutes
          const recent = alerts.find(
            (a) => a.rule.id === rule.id && Date.now() - a.triggeredAt < 300_000
          );
          if (!recent) {
            newAlerts.push({
              id: `trigger-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              rule,
              message,
              triggeredAt: Date.now(),
            });

            // Send browser notification if supported
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("🐋 Price Alert", { body: message });
            }
          }
        }
      }

      if (newAlerts.length > 0) {
        setAlerts((prev) => [...newAlerts, ...prev].slice(0, 20));
      }
    },
    [rules, alerts]
  );

  return { rules, alerts, addRule, removeRule, dismissAlert, checkPrices };
}
