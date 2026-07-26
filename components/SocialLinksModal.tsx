"use client";

import type { TrackedPair } from "@/lib/types";

interface SocialLinksModalProps {
  pair: TrackedPair;
  onClose: () => void;
}

export function SocialLinksModal({ pair, onClose }: SocialLinksModalProps) {
  const socialLinks = [
    { name: "Twitter/X", icon: "𝕏", type: "twitter" },
    { name: "Telegram", icon: "✈", type: "telegram" },
    { name: "Discord", icon: "🎮", type: "discord" },
    { name: "Website", icon: "🌐", type: "website" },
  ];

  const getLinksForType = (type: string) => {
    if (!pair.socials && !pair.websites) return [];
    
    const links = [];
    
    // Get social links
    if (pair.socials) {
      const socials = pair.socials.filter(s => {
        const sType = s.type.toLowerCase();
        return sType.includes(type) || 
               (type === 'twitter' && (sType.includes('x') || sType.includes('x.com'))) ||
               (type === 'telegram' && (sType.includes('t.me') || sType.includes('tg'))) ||
               (type === 'discord' && sType.includes('discord')) ||
               (type === 'website' && (sType.includes('web') || sType.includes('site')));
      });
      links.push(...socials.map(s => ({ url: s.url, label: s.type })));
    }
    
    // Get website links (only for website type)
    if (type === 'website' && pair.websites) {
      const websites = pair.websites.filter(w => {
        const url = w.url.toLowerCase();
        return !url.includes("dexscreener") && 
               !url.includes("birdeye") && 
               !url.includes("geckoterminal") && 
               !url.includes("coingecko") &&
               !url.includes("coinmarketcap");
      });
      links.push(...websites.map(w => ({ url: w.url, label: w.label || "Website" })));
    }
    
    // Deduplicate by URL
    const seen = new Set<string>();
    return links.filter(link => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    });
  };

  const hasAnyLinks = socialLinks.some(link => getLinksForType(link.type).length > 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        
        <header className="dhead">
          <div className="dhead-meta">
            <div className="dhead-name">
              <span className="token-sym">{pair.symbol}</span>
              <span className="token-name">{pair.name}</span>
            </div>
            <div className="dhead-sub">Social Media & Links</div>
          </div>
        </header>

        {!hasAnyLinks ? (
          <div className="modal-body">
            <p className="muted">No social media links or websites found for this token.</p>
          </div>
        ) : (
          <div className="modal-body">
            {socialLinks.map((social) => {
              const links = getLinksForType(social.type);
              if (links.length === 0) return null;
              
              return (
                <div key={social.type} className="social-category">
                  <h3 className="social-category-title">
                    <span className="social-category-icon">{social.icon}</span>
                    {social.name}
                  </h3>
                  <div className="social-links-list">
                    {links.map((link, index) => (
                      <a
                        key={`${social.type}-${index}`}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="social-link-item"
                      >
                        <span className="social-link-label">{link.label}</span>
                        <span className="social-link-url">{link.url}</span>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}