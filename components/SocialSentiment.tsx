"use client";

import { formatAge } from "@/lib/format";

interface SentimentItem {
  id: string;
  source: "twitter" | "telegram" | "discord" | "reddit";
  text: string;
  author: string;
  timestamp: number;
  sentiment: "bullish" | "bearish" | "neutral";
  tokenSymbol?: string;
  url?: string;
}

interface SocialSentimentProps {
  items: SentimentItem[];
  isLoading?: boolean;
}

export function SocialSentiment({ items, isLoading }: SocialSentimentProps) {
  return (
    <div className="sentiment-panel">
      <div className="sentiment-header">
        <div className="sentiment-title">
          <span>📡</span>
          <span>Social Sentiment</span>
          {items.length > 0 && (
            <span className="muted" style={{ fontSize: 11 }}>
              ({items.length})
            </span>
          )}
        </div>
        <span className="muted" style={{ fontSize: 11 }}>
          Sample data — demo feed, not live
        </span>
      </div>

      {isLoading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-mute)", fontSize: 12 }}>
          Scanning social channels…
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-mute)", fontSize: 12 }}>
          No recent social activity
        </div>
      ) : (
        <div className="sentiment-list">
          {items.map((item) => (
            <SentimentRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function SentimentRow({ item }: { item: SentimentItem }) {
  const sourceClass = `sentiment-source-${item.source}`;
  const sourceIcon = {
    twitter: "𝕏",
    telegram: "✈",
    discord: "💬",
    reddit: "📌",
  }[item.source];

  return (
    <div className="sentiment-item">
      <div className={`sentiment-source-icon ${sourceClass}`}>
        {sourceIcon}
      </div>
      <div className="sentiment-content">
        <div className="sentiment-text">
          {item.text}
        </div>
        <div className="sentiment-meta">
          <span>{item.author}</span>
          {item.tokenSymbol && (
            <span style={{ color: "var(--accent)" }}>${item.tokenSymbol}</span>
          )}
          <span>{formatAge(Date.now() - item.timestamp)} ago</span>
          <span className={`sentiment-score ${item.sentiment}`}>
            {item.sentiment}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Generate mock sentiment data for demonstration.
 * In production, this would connect to Twitter API, Telegram bots, etc.
 */
export function generateMockSentiment(): SentimentItem[] {
  const now = Date.now();
  return [
    {
      id: "1",
      source: "twitter",
      text: "New gem on Robinhood Chain looking promising. Volume picking up nicely.",
      author: "@defi_whale",
      timestamp: now - 300_000,
      sentiment: "bullish",
      tokenSymbol: "RHOOD",
    },
    {
      id: "2",
      source: "telegram",
      text: "Liquidity locked for 6 months on the new pool. Team seems solid.",
      author: "Alpha Group",
      timestamp: now - 900_000,
      sentiment: "bullish",
    },
    {
      id: "3",
      source: "discord",
      text: "Anyone else noticing unusual wallet activity on the Robinhood chain today?",
      author: "chain_watcher",
      timestamp: now - 1_800_000,
      sentiment: "neutral",
    },
    {
      id: "4",
      source: "twitter",
      text: "Careful with the new launches today — seeing some suspicious contract patterns.",
      author: "@safety_first",
      timestamp: now - 3_600_000,
      sentiment: "bearish",
    },
    {
      id: "5",
      source: "reddit",
      text: "Great analysis on the Robinhood Chain ecosystem growth. Bullish on the L2 narrative.",
      author: "u/crypto_analyst",
      timestamp: now - 7_200_000,
      sentiment: "bullish",
    },
  ];
}
