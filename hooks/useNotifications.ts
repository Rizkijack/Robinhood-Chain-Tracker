"use client";

import { useEffect, useRef } from "react";
import type { TrackedPair } from "@/lib/types";
import { useFeedStore, useNotificationStore } from "@/lib/store";

/**
 * Stable DexScreener link for a pair. Prefer the pair's canonical link (when
 * present), otherwise build a Robinhood-slug URL. We never interpolate
 * `pair.dexId` (untrusted external data) into the path.
 */
function pairDexscreenerUrl(
  pair: Pick<TrackedPair, "pairAddress" | "tokenAddress" | "links">
): string {
  if (pair.links?.dexscreener) return pair.links.dexscreener;
  return `https://dexscreener.com/robinhood/${pair.pairAddress || pair.tokenAddress}`;
}

/**
 * Hook that watches feed changes and fires notifications for:
 * - New pairs (token address not seen before)
 * - Price spikes (priceChange5m exceeds threshold)
 *
 * Fires both browser notifications (if permission granted) and in-app toasts.
 */
export function useNotifications() {
  const feed = useFeedStore((s) => s.feed);
  const {
    newPairAlerts,
    priceSpikeAlerts,
    toastAlerts,
    spikeThresholdPct,
    permission,
    hasPrompted,
    setPermission,
    setHasPrompted,
    addToast,
  } = useNotificationStore();

  // Track seen addresses to detect new pairs
  const seenAddresses = useRef<Set<string>>(new Set());
  // Track last known price changes to detect spikes
  const lastPriceChanges = useRef<Map<string, number>>(new Map());

  // Request notification permission on first interaction
  useEffect(() => {
    if (hasPrompted || typeof window === "undefined") return;

    const requestPermission = async () => {
      try {
        const perm = await Notification.requestPermission();
        setPermission(perm);
        setHasPrompted(true);
      } catch {
        setPermission("denied");
        setHasPrompted(true);
      }
    };

    // Request on first user interaction
    const handleInteraction = () => {
      requestPermission();
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };

    document.addEventListener("click", handleInteraction);
    document.addEventListener("keydown", handleInteraction);

    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  }, [hasPrompted, setPermission, setHasPrompted]);

  // Watch feed for new pairs and price spikes
  useEffect(() => {
    if (!feed?.pairs) return;

    const now = Date.now();

    for (const pair of feed.pairs) {
      const addr = pair.tokenAddress;
      if (!addr) continue;

      // --- New pair detection ---
      if (newPairAlerts && !seenAddresses.current.has(addr)) {
        seenAddresses.current.add(addr);

        const isRecent = pair.ageMs != null && pair.ageMs < 300_000; // < 5 min
        if (isRecent) {
          const title = `${pair.symbol} — New Pair`;
          const message = `${pair.name} • Liq $${pair.liquidityUsd ? (pair.liquidityUsd / 1_000_000).toFixed(1) + "M" : "?"}`;

          if (permission === "granted" && typeof Notification !== "undefined") {
            try {
              new Notification(title, {
                body: message,
                icon: pair.imageUrl || "/logo.svg",
                tag: `newpair-${addr}`,
              }).onclick = () => {
                window.open(pairDexscreenerUrl(pair), "_blank", "noopener,noreferrer");
              };
            } catch {
              /* ignore notification errors in unsupported contexts */
            }
          }

          if (toastAlerts) {
            addToast({
              type: "info",
              title,
              message,
              duration: 6000,
            });
          }
        }
      }

      // --- Price spike detection ---
      if (priceSpikeAlerts && pair.priceChange5m != null) {
        const prevChange = lastPriceChanges.current.get(addr);
        const currentChange = pair.priceChange5m;

        // Detect when price change crosses the threshold (from below to above)
        if (
          prevChange != null &&
          prevChange < spikeThresholdPct &&
          currentChange >= spikeThresholdPct
        ) {
          const direction = currentChange > 0 ? "↑" : "↓";
          const title = `${pair.symbol} — Price ${direction}${Math.abs(currentChange).toFixed(1)}%`;
          const message = `${pair.name} • ${direction}${Math.abs(currentChange).toFixed(1)}% in 5m`;

          if (permission === "granted" && typeof Notification !== "undefined") {
            try {
              new Notification(title, {
                body: message,
                icon: pair.imageUrl || "/logo.svg",
                tag: `spike-${addr}`,
              }).onclick = () => {
                window.open(pairDexscreenerUrl(pair), "_blank", "noopener,noreferrer");
              };
            } catch {
              /* ignore notification errors in unsupported contexts */
            }
          }

          if (toastAlerts) {
            addToast({
              type: currentChange > 0 ? "success" : "warning",
              title,
              message,
              duration: 5000,
            });
          }
        }

        lastPriceChanges.current.set(addr, currentChange);
      }
    }

    // Cleanup: remove addresses no longer in feed from lastPriceChanges
    // (but keep in seenAddresses so we don't re-notify)
    for (const addr of lastPriceChanges.current.keys()) {
      if (!feed.pairs.some((p) => p.tokenAddress === addr)) {
        lastPriceChanges.current.delete(addr);
      }
    }
  }, [feed?.pairs, feed?.updatedAt]); // Re-run when feed updates

  // Cleanup seen addresses periodically to avoid memory growth
  useEffect(() => {
    const interval = setInterval(() => {
      // Keep only the most recent 500 addresses
      if (seenAddresses.current.size > 500) {
        const entries = Array.from(seenAddresses.current);
        seenAddresses.current = new Set(entries.slice(-300));
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, []);
}
