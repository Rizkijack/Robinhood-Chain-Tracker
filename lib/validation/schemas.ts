import { z } from "zod";

/**
 * Sanitize string input by:
 * - Trimming whitespace
 * - Removing null bytes and control characters
 * - Preventing path traversal attacks
 * - Removing potential SQL injection patterns
 * - Filtering dangerous characters
 */
function sanitizeString(input: string): string {
  if (typeof input !== "string") return "";

  return input
    .trim()
    // Remove null bytes
    .replace(/\0/g, "")
    // Remove control characters (except newline, tab)
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    // Prevent path traversal (../)
    .replace(/\.\./g, "")
    // Remove null bytes
    .replace(/\u0000/g, "")
    // Remove potential SQL injection patterns
    .replace(/(\b|\s)OR\b/gi, "")
    .replace(/(\b|\s)AND\b/gi, "")
    .replace(/--/g, "")
    .replace(/\/\*/g, "")
    .replace(/\*\//g, "")
    // Remove dangerous characters that could be used for injection
    .replace(/[<>\"'`;{}[\]()]/g, "")
    // Normalize whitespace
    .replace(/\s+/g, " ");
}

/**
 * Sanitize URL input for external API requests
 */
function sanitizeUrlInput(input: string): string {
  return sanitizeString(input)
    // Remove URL encoding that could be used maliciously
    .replace(/%[0-9a-fA-F]{2}/g, "")
    // Remove potential XSS patterns
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
    // Limit to alphanumeric, spaces, and common symbols
    .replace(/[^a-zA-Z0-9\s\-_\.]/g, "")
    .substring(0, 200);
}

/**
 * Validate and sanitize Ethereum/Robinhood address
 */
function sanitizeAddress(input: string): string {
  const cleaned = sanitizeString(input).toLowerCase();
  return cleaned;
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
