"use client";

import { useState } from "react";
import { useNotificationStore } from "@/lib/store";

export function NotificationSettings() {
  const [open, setOpen] = useState(false);
  const {
    newPairAlerts,
    priceSpikeAlerts,
    toastAlerts,
    spikeThresholdPct,
    permission,
    setNewPairAlerts,
    setPriceSpikeAlerts,
    setToastAlerts,
    setSpikeThresholdPct,
  } = useNotificationStore();

  const permLabel =
    permission === "granted" ? "On" : permission === "denied" ? "Blocked" : "Click to enable";

  const anyAlerts = newPairAlerts || priceSpikeAlerts;

  return (
    <div className="notif-settings">
      <button
        type="button"
        className={`btn notif-toggle ${anyAlerts ? "has-alerts" : ""}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Notification settings"
        title={anyAlerts ? "Notifications on" : "Notifications off"}
      >
        <span className={`bell ${anyAlerts ? "on" : ""}`} aria-hidden="true">
          🔔
        </span>
        {anyAlerts ? <span className="bell-dot" /> : null}
      </button>

      {open && (
        <div className="notif-menu" role="menu">
          <div className="notif-menu-header">
            <span>Notifications</span>
            <button
              type="button"
              className="notif-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="notif-row">
            <label className="notif-label">
              <span>New pair alerts</span>
              <span className="notif-sub">{permLabel}</span>
            </label>
            <button
              type="button"
              className={`notif-switch ${newPairAlerts ? "on" : ""}`}
              onClick={() => setNewPairAlerts(!newPairAlerts)}
              aria-pressed={newPairAlerts}
            >
              <span className="notif-knob" />
            </button>
          </div>

          <div className="notif-row">
            <label className="notif-label">
              <span>Price spike alerts</span>
              <span className="notif-sub">Threshold: {spikeThresholdPct}%</span>
            </label>
            <button
              type="button"
              className={`notif-switch ${priceSpikeAlerts ? "on" : ""}`}
              onClick={() => setPriceSpikeAlerts(!priceSpikeAlerts)}
              aria-pressed={priceSpikeAlerts}
            >
              <span className="notif-knob" />
            </button>
          </div>

          {priceSpikeAlerts && (
            <div className="notif-slider-row">
              <label className="notif-label">
                <span>Spike threshold</span>
                <span className="notif-sub">{spikeThresholdPct}%</span>
              </label>
              <input
                type="range"
                min={1}
                max={50}
                value={spikeThresholdPct}
                onChange={(e) => setSpikeThresholdPct(Number(e.target.value))}
                className="notif-slider"
              />
            </div>
          )}

          <div className="notif-row">
            <label className="notif-label">
              <span>In-app toasts</span>
              <span className="notif-sub">Show toast popups</span>
            </label>
            <button
              type="button"
              className={`notif-switch ${toastAlerts ? "on" : ""}`}
              onClick={() => setToastAlerts(!toastAlerts)}
              aria-pressed={toastAlerts}
            >
              <span className="notif-knob" />
            </button>
          </div>

          <div className="notif-footer">
            <span className="notif-perm">{permLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
