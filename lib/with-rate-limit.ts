/**
 * Higher-order function that wraps API route handlers with rate limiting.
 *
 * Usage:
 *   export const GET = withRateLimit(
 *     apiLimiter,
 *     async (req) => { ... }
 *   );
 */

import { NextRequest, NextResponse } from "next/server";
import type { RateLimiter } from "./rate-limit";

type RouteHandler = (
  req: NextRequest,
  context?: { params: Record<string, string> }
) => Promise<NextResponse> | NextResponse;

/**
 * Extracts a unique key for rate limiting from the request.
 * Uses CF-Connecting-IP (Cloudflare) → X-Forwarded-For → x-real-ip → fallback.
 */
function rateLimitKey(req: NextRequest): string {
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1";

  const path = req.nextUrl?.pathname ?? "/unknown";
  return `${ip}:${path}`;
}

/**
 * Wraps a route handler with the given rate limiter.
 * Returns 429 with Retry-After header when the limit is exceeded.
 */
export function withRateLimit(
  limiter: RateLimiter,
  handler: RouteHandler
): RouteHandler {
  return async (req: NextRequest, context?: { params: Record<string, string> }) => {
    const key = rateLimitKey(req);
    const result = limiter.check(key);

    // Build rate-limit headers
    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(limiter["max"]),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(Math.ceil(result.resetInMs / 1000)),
    };

    if (!result.allowed) {
      headers["Retry-After"] = String(Math.ceil(result.resetInMs / 1000));
      return NextResponse.json(
        { error: "Rate limit terlampaui. Silakan tunggu sebelum mencoba lagi." },
        { status: 429, headers }
      );
    }

    const response = await handler(req, context);

    // Attach rate-limit headers to the successful response
    if (response instanceof NextResponse) {
      for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
      }
    }

    return response;
  };
}
