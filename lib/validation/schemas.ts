import { z } from "zod";

/**
 * Sanitize string input by:
 * - Trimming whitespace
 * - Removing null bytes and control characters
 * - Normalizing runs of whitespace to a single space
 *
 * Intentionally minimal: there is no SQL database here and every value is
 * ultimately passed to external HTTP APIs via `URLSearchParams`, which
 * percent-encodes it. Historically this function also stripped SQL keywords
 * (OR/AND), "..", parentheses, quotes and %XX sequences — that was cargo-cult
 * "security" that provided no real protection (no SQL engine, values already
 * URL-encoded) while corrupting legitimate inputs such as token names that
 * contain "OR", "AND" or brackets.
 *
 * Real validation happens at the zod schema level below (whitelist regexes +
 * length limits), so this helper is intentionally minimal.
 */
function sanitizeString(input: string): string {
  if (typeof input !== "string") return "";

  return input
    .trim()
    // Remove null bytes and control characters
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    // Normalize whitespace runs to a single space
    .replace(/\s+/g, " ");
}

/**
 * Sanitize URL input for external API requests.
 *
 * Values passed here are always URL-encoded before being sent to external
 * sources (guarding against injection / SSRF), so the only additional
 * defence-in-depth we keep is stripping dangerous URL scheme prefixes.
 */
function sanitizeUrlInput(input: string): string {
  return sanitizeString(input)
    // Remove dangerous URL scheme prefixes (defence in depth; the actual
    // protection is the URLSearchParams encoding + zod schemas below).
    .replace(/javascript:/gi, "")
    .replace(/vbscript:/gi, "")
    .replace(/data:/gi, "")
    .replace(/file:/gi, "");
}

/**
 * Sanitize search query specifically for external API searches
 */
function sanitizeSearchQuery(input: string): string {
  return sanitizeUrlInput(input)
    // Limit to alphanumeric, spaces, and common symbol punctuation
    .replace(/[^a-zA-Z0-9\s\-_\.]/g, "")
    .substring(0, 200);
}

/**
 * Validate and sanitize Ethereum/Robinhood address
 */
function sanitizeAddress(input: string): string {
  return sanitizeString(input).toLowerCase();
}

// Export sanitization utilities for reuse
export { sanitizeString, sanitizeUrlInput, sanitizeSearchQuery, sanitizeAddress };

/** Valid Ethereum/Robinhood token or pair address (0x-prefixed hex) */
export const addressParam = z
  .string()
  .transform(sanitizeAddress)
  .pipe(
    z.string()
      .min(1, "Address is required")
      .max(42, "Address is too long")
      .regex(/^0x[a-fA-F0-9]+$/, "Invalid address format (must be 0x-prefixed hex)")
  );

/** Search query string with sanitization */
export const searchQuery = z
  .string()
  .min(1, "Search query is required")
  .max(200, "Search query too long (max 200 characters)")
  .transform(sanitizeSearchQuery)
  .refine((v) => v.length > 0, {
    message: "Search query contains invalid characters",
  });

/** Optional pagination limit */
export const optionalLimit = z
  .string()
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : undefined;
  });

/** Stats or feed route params — no required inputs, just validates if present */
export const emptyParams = z.object({}).strict();

/** Full set of optional filter params used by pair feeds (new, trending, boosts) */
export const feedQueryParams = z.object({
  limit: optionalLimit,
}).strict().optional();

/** Search route params */
export const searchQueryParams = z.object({
  q: searchQuery,
}).strict();