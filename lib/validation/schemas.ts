import { z } from "zod";

/** Valid Ethereum/Robinhood token or pair address (0x-prefixed hex) */
export const addressParam = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(
    z.string()
      .min(1, "Address is required")
      .regex(/^0x[a-fA-F0-9]+$/, "Invalid address format (must be 0x-prefixed hex)")
  );

/** Search query string */
export const searchQuery = z
  .string()
  .min(1, "Search query is required")
  .max(200, "Search query too long (max 200 characters)")
  .transform((v) => v.trim());

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
