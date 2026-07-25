/**
 * React hook for blockchain streaming.
 * 
 * This hook provides a simple interface to the streaming system,
 * allowing components to subscribe to real-time blockchain events.
 * 
 * Features:
 * - Automatic connection management
 * - Real-time block updates
 * - Connection status tracking
 * - Automatic fallback to polling
 */

import { useEffect, useState, useCallback } from "react";
import { getConnectionManager } from "./connection-manager";
import type { ConnectionSnapshot, SubscriptionType } from "./types";

/**
 * Hook for subscribing to blockchain streaming.
 * 
 * @param wsUrl - WebSocket URL (optional, uses environment variable if not provided)
 * @param sseUrl - SSE URL (optional, uses environment variable if not provided)
 * @returns Connection snapshot and control functions
 */
export function useBlockchainStream(wsUrl?: string, sseUrl?: string) {
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>(() => {
    const manager = getConnectionManager();
    return manager.getSnapshot();
  });

  useEffect(() => {
    const manager = getConnectionManager();
    
    // Start the connection if not already started
    manager.start(wsUrl, sseUrl);
    
    // Subscribe to snapshot updates
    const unsubscribe = manager.subscribe((newSnapshot) => {
      setSnapshot(newSnapshot);
    });
    
    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [wsUrl, sseUrl]);

  const retry = useCallback(() => {
    const manager = getConnectionManager();
    manager.retry(wsUrl, sseUrl);
  }, [wsUrl, sseUrl]);

  const stop = useCallback(() => {
    const manager = getConnectionManager();
    manager.stop();
  }, []);

  return {
    snapshot,
    retry,
    stop,
    isConnected: snapshot.status === "connected",
    isConnecting: snapshot.status === "connecting" || snapshot.status === "reconnecting",
    connectionMethod: snapshot.method,
    latestBlock: snapshot.latestBlock,
    latency: snapshot.latencyMs,
  };
}

/**
 * Hook for subscribing to specific blockchain events.
 * 
 * @param type - Subscription type ("newHeads", "logs", "newPendingTransactions")
 * @param wsUrl - WebSocket URL (optional)
 * @param sseUrl - SSE URL (optional)
 */
export function useBlockchainSubscription(
  type: SubscriptionType,
  wsUrl?: string,
  sseUrl?: string
) {
  const stream = useBlockchainStream(wsUrl, sseUrl);
  const [events, setEvents] = useState<unknown[]>([]);

  useEffect(() => {
    if (!stream.isConnected) return;

    const manager = getConnectionManager();
    
    // Subscribe to the specific event type
    // Note: This is a simplified example - actual implementation depends on your needs
    const handleEvent = (data: unknown) => {
      setEvents((prev) => [...prev.slice(-99), data]); // Keep last 100 events
    };

    // In a real implementation, you'd subscribe to specific events
    // For now, we'll just track the connection status
    
    return () => {
      // Cleanup
    };
  }, [stream.isConnected, type]);

  return {
    ...stream,
    events,
    eventCount: events.length,
  };
}
