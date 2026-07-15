/**
 * Background refresh script — pre-warms the cache by fetching all data feeds
 * so that subsequent user requests are served from cache instead of hitting
 * external APIs synchronously.
 *
 * Designed to be called from a Vercel Cron Job (/api/cron/refresh) which
 * runs on a schedule (e.g. every minute).
 *
 * The cache backend is Upstash Redis (lib/cache.ts) so every Vercel
 * serverless instance shares the same warmed cache. When Redis env vars
 * are not configured, cache falls back to an in-memory Map (dev mode).
 *
 * Each call is independently caught — one failing source never blocks
 * the others from refreshing.
 */

import {
  getBoostsFeed,
  getNewPairsFeed,
  getStats,
  getTrendingFeed,
} from "./aggregate";

interface RefreshResult {
  updatedAt: string;
  feeds: {
    newPairs: { count: number; status: "ok" | "error" };
    trending: { count: number; status: "ok" | "error" };
    boosts: { count: number; status: "ok" | "error" };
    stats: { status: "ok" | "error" };
  };
  durationMs: number;
  errors: string[];
}

export async function refreshAllFeeds(): Promise<RefreshResult> {
  const start = Date.now();
  const errors: string[] = [];

  const [newRes, trendRes, boostRes, statsRes] = await Promise.allSettled([
    getNewPairsFeed(),
    getTrendingFeed(),
    getBoostsFeed(),
    getStats(),
  ]);

  const feeds = {
    newPairs: {
      count: newRes.status === "fulfilled" ? newRes.value.count : 0,
      status: newRes.status === "fulfilled" ? ("ok" as const) : ("error" as const),
    },
    trending: {
      count: trendRes.status === "fulfilled" ? trendRes.value.count : 0,
      status: trendRes.status === "fulfilled" ? ("ok" as const) : ("error" as const),
    },
    boosts: {
      count: boostRes.status === "fulfilled" ? boostRes.value.count : 0,
      status: boostRes.status === "fulfilled" ? ("ok" as const) : ("error" as const),
    },
    stats: {
      status: statsRes.status === "fulfilled" ? ("ok" as const) : ("error" as const),
    },
  };

  for (const r of [newRes, trendRes, boostRes, statsRes]) {
    if (r.status === "rejected") {
      errors.push(String(r.reason).slice(0, 200));
    }
  }

  return {
    updatedAt: new Date().toISOString(),
    feeds,
    durationMs: Date.now() - start,
    errors,
  };
}
