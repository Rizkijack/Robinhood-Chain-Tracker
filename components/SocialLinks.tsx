"use client";

import type { TrackedPair } from "@/lib/types";

const SOCIAL_ICONS: Record<string, string> = {
  twitter: "𝕏",
  x: "𝕏",
  telegram: "✈",
  tg: "✈",
  discord: "🎮",
  website: "🌐",
  web: "🌐",
  reddit: "r/",
  tiktok: "🎵",
  instagram: "📷",
  youtube: "▶",
};

function getSocialType(type: string): string {
  const t = type.toLowerCase().trim();
  if (t.includes("twitter") || t.includes("x.com") || t === "x") return "twitter";
  if (t.includes("telegram") || t.includes("tg") || t.includes("t.me")) return "telegram";
  if (t.includes("discord") || t.includes("discord.gg")) return "discord";
  if (t.includes("reddit") || t.includes("r/")) return "reddit";
  if (t.includes("tiktok")) return "tiktok";
  if (t.includes("instagram") || t.includes("ig")) return "instagram";
  if (t.includes("youtube") || t.includes("youtu")) return "youtube";
  if (t.includes("web") || t.includes("site") || t.includes("http")) return "website";
  return t;
}

function getSocialIcon(type: string): string {
  return SOCIAL_ICONS[type] ?? SOCIAL_ICONS[getSocialType(type)] ?? "🔗";
}

function getSocialTitle(type: string): string {
  const t = type.toLowerCase().trim();
  if (t.includes("twitter") || t === "x") return "Twitter / X";
  if (t.includes("telegram") || t.includes("t.me")) return "Telegram";
  if (t.includes("discord")) return "Discord";
  if (t.includes("reddit")) return "Reddit";
  if (t.includes("tiktok")) return "TikTok";
  if (t.includes("instagram") || t.includes("ig")) return "Instagram";
  if (t.includes("youtube") || t.includes("youtu")) return "YouTube";
  if (t.includes("web") || t.includes("site") || t.includes("http")) return "Website";
  return type;
}

export function SocialLinks({
  pair,
  compact,
  maxLinks,
}: {
  pair: TrackedPair;
  compact?: boolean;
  maxLinks?: number;
}) {
  const links: { type: string; url: string }[] = [];

  // Collect socials
  if (pair.socials?.length) {
    for (const s of pair.socials) {
      const t = getSocialType(s.type);
      // Only include Twitter, Telegram, Discord, Website
      if (["twitter", "telegram", "discord", "website"].includes(t)) {
        links.push({ type: t, url: s.url });
      }
    }
  }

  // Also check websites for homepage
  if (pair.websites?.length && !links.some((l) => l.type === "website")) {
    const site = pair.websites.find(
      (w) => !w.url.includes("dexscreener") && !w.url.includes("birdeye")
    );
    if (site) {
      links.push({ type: "website", url: site.url });
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = links.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  const displayLinks = maxLinks ? unique.slice(0, maxLinks) : unique;

  if (!displayLinks.length) {
    return <span className="social-none muted mono">—</span>;
  }

  return (
    <div
      className={`social-links ${compact ? "compact" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {displayLinks.map((link, i) => (
        <a
          key={`${link.type}-${i}`}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className={`social-link social-${link.type}`}
          title={getSocialTitle(link.type)}
          aria-label={getSocialTitle(link.type)}
        >
          <span className="social-icon">{getSocialIcon(link.type)}</span>
        </a>
      ))}
    </div>
  );
}
