// Vercel Cron Job endpoint — pre-warms the Upstash Redis cache by fetching
// all data feeds on a schedule (falls back to in-memory cache without Redis).
//
// Configure in vercel.json:
//   "crons": [{
//     "path": "/api/cron/refresh",
//     "schedule": "*/5 * * * *"
//   }]
//
// For local testing, call: curl http://localhost:3000/api/cron/refresh
//
// The cron secret is optional but strongly recommended in production to
// prevent public abuse. Set CRON_SECRET in Vercel env vars. When CRON_SECRET
// is set, Vercel Cron automatically sends it in an `Authorization` header of
// the form `Bearer <secret>`, which this handler also accepts. Leaving it
// unset exposes the endpoint publicly (acceptable for development).

import { z } from "zod";
import { NextResponse } from "next/server";
import { refreshAllFeeds } from "@/lib/background-refresh";
import { getBoostsFeed, getNewPairsFeed, getTrendingFeed } from "@/lib/aggregate";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Cron jobs can run up to 30s on Hobby plan

type RefreshResult = {
  feeds: Record<string, { count?: number; status: "ok" | "error" }>;
  errors: string[];
};

const feedEnum = z.enum(["new", "trending", "boosts"]).optional();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  // If CRON_SECRET is configured, validate it. Vercel Cron sends it as a
  // "Bearer <secret>" Authorization header; also allow a ?secret= query param
  // for local/manual testing.
  let authorized = true;
  if (expected) {
    const authHeader = request.headers.get("authorization");
    const bearer = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    authorized = secret === expected || bearer === expected;
  }
  if (!authorized) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  // Optional: refresh a specific feed (new | trending | boosts); default all.
  const rawFeed = searchParams.get("feed");
  const feedParse = feedEnum.safeParse(rawFeed ?? undefined);
  if (!feedParse.success) {
    return NextResponse.json(
      { error: "Invalid feed. Must be one of: new, trending, boosts" },
      { status: 400 }
    );
  }
  const feed = feedParse.data;

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
