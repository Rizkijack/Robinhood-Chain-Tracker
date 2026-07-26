"use client";

/**
 * Compact connection-status indicator.
 *
 * Shows a colored dot + label reflecting the active transport:
 *   🟢 green   — WebSocket (Tier 1, real-time)
 *   🟡 yellow  — Polling (Tier 3, fallback)
 *   ⚪ gray    — Connecting (WS handshake in progress, ≤ 3s)
 *   🔴 red     — Disconnected (shouldn't normally happen — polling
 *                keeps running even when WS fails)
 *
 * Designed to drop into the MetaInfo row next to the existing
 * "Live · every Ns" badge. Tiny, no layout shift.
 */

import { useBlockchainStream } from "@/hooks/useBlockchainStream";
import type { ConnectionMethod } from "@/lib/streaming/types";

interface StatusConfig {
  label: string;
  color: string;
  boxShadow: string;
  title: string;
}

function getConfig(
  method: ConnectionMethod,
  status: string
): StatusConfig {
  if (status === "connecting") {
    return {
      label: "Connecting",
      color: "var(--text-mute, #9ca3af)",
      boxShadow: "0 0 0 3px rgba(156, 163, 175, 0.15)",
      title: "Establishing real-time connection (≤ 3s)…",
    };
  }
  if (status === "reconnecting") {
    return {
      label: "Reconnecting",
      color: "var(--yellow, #eab308)",
      boxShadow: "0 0 0 3px rgba(234, 179, 8, 0.15)",
      title: "WebSocket dropped — retrying…",
    };
  }
  if (status === "error") {
    return {
      label: "Disconnected",
      color: "var(--red, #ef4444)",
      boxShadow: "0 0 0 3px rgba(239, 68, 68, 0.15)",
      title: "Connection error",
    };
  }
  if (method === "websocket") {
    return {
      label: "Real-time",
      color: "var(--green, #22c55e)",
      boxShadow: "0 0 0 3px rgba(34, 197, 94, 0.15)",
      title: "Live via WebSocket (sub-second latency)",
    };
  }
  // polling
  return {
    label: "Polling",
    color: "var(--yellow, #eab308)",
    boxShadow: "0 0 0 3px rgba(234, 179, 8, 0.15)",
    title: "Using HTTP polling (WebSocket unavailable or blocked)",
  };
}

export function ConnectionStatus() {
  const { method, isConnected, snapshot } = useBlockchainStream();
  const config = getConfig(method, snapshot.status);

  return (
    <span
      className="conn-status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--text-dim, currentColor)",
      }}
      title={config.title}
    >
      <span
        className="conn-status-dot"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: config.color,
          boxShadow: config.boxShadow,
          animation:
            method === "websocket" || snapshot.status === "connecting"
              ? "pulse 1.5s ease infinite"
              : "none",
          opacity: isConnected ? 1 : 0.6,
        }}
      />
      <span>{config.label}</span>
    </span>
  );
}
