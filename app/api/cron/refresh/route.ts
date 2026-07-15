// Vercel Cron Job endpoint — pre-warms the Upstash Redis cache by fetching
// all data feeds on a schedule (falls back to in-memory cache without Redis).
//
// Configure in vercel.json:
//   "crons": [{
//     "path": "/api/cron/refresh",
//     "schedule": "*/1 * * * *"
//   }]
//
// For local testing, call: curl http://localhost:3000/api/cron/refresh
//
// The cron secret is optional but recommended to prevent abuse.
// Set CRON_SECRET in Vercel env vars, then pass it as ?secret= in the cron URL.
// If no CRON_SECRET is configured, the endpoint is publicly accessible
// (acceptable for development).

import { NextResponse } from "next/server";
import { refreshAllFeeds } from "@/lib/background-refresh";
import { getBoostsFeed, getNewPairsFeed, getTrendingFeed } from "@/lib/aggregate";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Cron jobs can run up to 30s on Hobby plan

type RefreshResult = {
  feeds: Record<string, { count?: number; status: "ok" | "error" }>;
  errors: string[];
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  // If CRON_SECRET is configured, validate it
  if (expected && secret !== expected) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  // Optional: check for a specific feed query param, refresh all by default
  const feed = searchParams.get("feed") as "new" | "trending" | "boosts" | null;

  try {
    const start = Date.now();

    let result: RefreshResult;
    if (feed === "new") {
      const data = await getNewPairsFeed();
      result = { feeds: { newPairs: { count: data.count, status: "ok" as const } }, errors: [] };
    } else if (feed === "trending") {
      const data = await getTrendingFeed();
      result = { feeds: { trending: { count: data.count, status: "ok" as const } }, errors: [] };
    } else if (feed === "boosts") {
      const data = await getBoostsFeed();
      result = { feeds: { boosts: { count: data.count, status: "ok" as const } }, errors: [] };
    } else {
      result = await refreshAllFeeds();
    }

    return NextResponse.json({
      ok: true,
      ...result,
      durationMs: Date.now() - start,
      cachedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 }
    );
  }
}
