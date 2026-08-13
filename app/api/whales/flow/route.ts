import { NextResponse } from "next/server";
import { fetchArkhamWhaleTransfers } from "@/lib/sources/arkham";
import { whaleLimiter } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";
import type { WhaleFlowData } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET_MS = 5 * 60 * 1000; // 5-minute buckets

/**
 * GET /api/whales/flow
 *
 * Returns time-bucketed whale flow analytics (inflow vs outflow)
 * for the last 4 hours, aggregated from Arkham whale transfers.
 */
export const GET = withRateLimit(whaleLimiter, async () => {
  const apiKey = process.env.ARKHAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ARKHAM_API_KEY not configured", flowData: [] },
      { status: 503 }
    );
  }

  try {
    const transfers = await fetchArkhamWhaleTransfers({ limit: 200, minValueUsd: 10_000 });
    const now = Date.now();
    const fourHoursAgo = now - 4 * 60 * 60 * 1000;

    // Initialize buckets
    const bucketMap = new Map<number, WhaleFlowData>();
    for (let t = fourHoursAgo; t <= now; t += BUCKET_MS) {
      const bucketTime = Math.floor(t / BUCKET_MS) * BUCKET_MS;
      bucketMap.set(bucketTime, {
        timestamp: bucketTime,
        inflowUsd: 0,
        outflowUsd: 0,
        netFlowUsd: 0,
        txCount: 0,
        topTokens: [],
      });
    }

    // Aggregate transfers into buckets
    const tokenVolumes = new Map<number, Map<string, number>>();

    for (const tx of transfers) {
      if (tx.timestamp < fourHoursAgo) continue;

      const bucketTime = Math.floor(tx.timestamp / BUCKET_MS) * BUCKET_MS;
      const bucket = bucketMap.get(bucketTime);
      if (!bucket) continue;

      bucket.txCount++;

      if (tx.type === "buy" || tx.type === "mint") {
        bucket.inflowUsd += tx.usdValue;
      } else if (tx.type === "sell" || tx.type === "burn") {
        bucket.outflowUsd += tx.usdValue;
      } else {
        // Transfers count as half in each direction
        bucket.inflowUsd += tx.usdValue * 0.5;
        bucket.outflowUsd += tx.usdValue * 0.5;
      }

      // Track token volumes per bucket
      if (!tokenVolumes.has(bucketTime)) {
        tokenVolumes.set(bucketTime, new Map());
      }
      const tv = tokenVolumes.get(bucketTime)!;
      tv.set(tx.tokenSymbol, (tv.get(tx.tokenSymbol) || 0) + tx.usdValue);
    }

    // Finalize buckets: compute net flow and top tokens
    const flowData: WhaleFlowData[] = [];
    for (const [ts, bucket] of bucketMap) {
      bucket.netFlowUsd = bucket.inflowUsd - bucket.outflowUsd;

      const tv = tokenVolumes.get(ts);
      if (tv) {
        bucket.topTokens = [...tv.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([symbol, volumeUsd]) => ({ symbol, volumeUsd }));
      }

      flowData.push(bucket);
    }

    flowData.sort((a, b) => a.timestamp - b.timestamp);

    return NextResponse.json(
      { flowData, count: flowData.length },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e), flowData: [] }, { status: 502 });
  }
});
