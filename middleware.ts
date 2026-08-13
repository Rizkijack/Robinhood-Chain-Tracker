import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Global middleware — security headers + CORS for API routes.
 *
 * - Sets security headers (HSTS, X-Content-Type-Options, X-Frame-Options,
 *   Referrer-Policy, Permissions-Policy) on every response.
 * - Applies permissive CORS only to /api/* so the dashboard can be
 *   consumed cross-origin; non-API routes are untouched.
 * - OPTIONS preflight short-circuits with 204.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), browsing-topics=()",
};

const API_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new NextResponse(null, { status: 204, headers: API_CORS });
  }

  const headers = new Headers(SECURITY_HEADERS);
  if (pathname.startsWith("/api/")) {
    for (const [key, value] of Object.entries(API_CORS)) {
      headers.set(key, value);
    }
  }

  return NextResponse.next({ request: { headers }, headers });
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico|logo.svg|manifest.json|sw.js).*)"],
};
