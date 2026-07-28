"use client";

import { useState, useCallback } from "react";
import { useWhaleStore, useNotificationStore } from "@/lib/store";
import type { WhaleAlertConfig } from "@/lib/types";

export function WhaleNotificationCenter() {
  const { alertConfigs, addAlertConfig, updateAlertConfig, removeAlertConfig } = useWhaleStore();
  const { toastAlerts, newPairAlerts, setToastAlerts } = useNotificationStore();
  const [showAdd, setShowAdd] = useState(false);

  const handleToggle = useCallback(
    (id: string, enabled: boolean) => {
      updateAlertConfig(id, { enabled });
    },
    [updateAlertConfig]
  );

  const handleAddDefault = useCallback(() => {
    const id = `alert-${Date.now()}`;
    addAlertConfig({
      id,
      enabled: true,
      minUsd: 50_000,
      tokenAddress: null,
      entityName: null,
      type: "all",
      notifyVia: "both",
    });
    setShowAdd(false);
  }, [addAlertConfig]);

  return (
    <div className="whale-notif-center">
      <div className="whale-notif-header">
        <div className="whale-notif-title">
          <span>🔔</span>
          <span>Whale Alerts</span>
        </div>
      </div>

      {/* Global toggles */}
      <div className="whale-notif-global">
        <label className="whale-notif-toggle">
          <input
            type="checkbox"
            checked={toastAlerts}
            onChange={(e) => setToastAlerts(e.target.checked)}
          />
          <span>In-app toasts</span>
        </label>
      </div>

      {/* Alert rules */}
      <div className="whale-notif-rules">
        {alertConfigs.map((config) => (
          <AlertRule
            key={config.id}
            config={config}
            onToggle={(enabled) => handleToggle(config.id, enabled)}
            onRemove={() => removeAlertConfig(config.id)}
            onUpdate={(updates) => updateAlertConfig(config.id, updates)}
          />
        ))}
      </div>

      <button
        type="button"
        className="whale-notif-add"
        onClick={handleAddDefault}
      >
        + Add Alert Rule
      </button>
    </div>
  );
}

function AlertRule({
  config,
  onToggle,
  onRemove,
  onUpdate,
}: {
  config: WhaleAlertConfig;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  onUpdate: (updates: Partial<WhaleAlertConfig>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`whale-notif-rule ${config.enabled ? "active" : "disabled"}`}>
      <div className="whale-notif-rule-header">
        <label className="whale-notif-rule-toggle">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
        </label>
        <span
          className="whale-notif-rule-label"
          onClick={() => setExpanded(!expanded)}
          role="button"
        >
          {config.type === "all" ? "All transactions" : config.type} ≥ ${(config.minUsd / 1000).toFixed(0)}K
        </span>
        <div className="whale-notif-rule-actions">
          <button
            type="button"
            className="whale-notif-rule-expand"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "▲" : "▼"}
          </button>
          <button
            type="button"
            className="whale-notif-rule-remove"
            onClick={onRemove}
          >
            ×
          </button>
        </div>
      </div>

      {expanded && (
        <div className="whale-notif-rule-detail">
          <div className="whale-notif-field">
            <label>Min USD Value</label>
            <select
              value={config.minUsd}
              onChange={(e) => onUpdate({ minUsd: Number(e.target.value) })}
            >
              <option value={10000}>$10,000</option>
              <option value={25000}>$25,000</option>
              <option value={50000}>$50,000</option>
              <option value={100000}>$100,000</option>
              <option value={500000}>$500,000</option>
              <option value={1000000}>$1,000,000</option>
            </select>
          </div>
          <div className="whale-notif-field">
            <label>Type</label>
            <select
              value={config.type}
              onChange={(e) => onUpdate({ type: e.target.value as WhaleAlertConfig["type"] })}
            >
              <option value="all">All</option>
              <option value="buy">Buy only</option>
              <option value="sell">Sell only</option>
              <option value="transfer">Transfer only</option>
            </select>
          </div>
          <div className="whale-notif-field">
            <label>Notify via</label>
            <select
              value={config.notifyVia}
              onChange={(e) => onUpdate({ notifyVia: e.target.value as WhaleAlertConfig["notifyVia"] })}
            >
              <option value="both">Toast + Browser</option>
              <option value="toast">Toast only</option>
              <option value="browser">Browser only</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
