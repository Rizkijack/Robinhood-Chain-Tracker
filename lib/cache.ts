/**
 * Shared cache layer — Upstash Redis (production) with in-memory Map fallback.
 *
 * On Vercel, every serverless function instance is ephemeral. An in-memory
 * Map only lives for the duration of that single instance — cron pre-warm
 * heats one instance while the next user request may hit a cold one with an
 * empty cache, causing all external APIs to be hit simultaneously (rate-limit
 * risk).
 *
 * Upstash Redis solves this: all instances share the same cache via a
 * globally-accessible HTTP-based Redis. The free tier is more than enough
 * for this use case (~10K commands/day).
 *
 * If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set, we
 * gracefully fall back to the original in-memory Map so local development
 * works without any external dependency.
 */

import { getRedis } from "./redis-client";

// ─── Key prefix to avoid collisions if the Upstash DB is shared ────────────
const PREFIX = "rh:";

// ─── In-memory fallback (original behaviour) ────────────────────────────────
type Entry<T> = { expires: number; value: T };
const memStore = new Map<string, Entry<unknown>>();

// ─── Single-flight ──────────────────────────────────────────────────────────
// When the cache is cold (e.g. right after a cron refresh or on a fresh
// serverless instance), concurrent requests for the same key would all
// re-fetch the external API simultaneously and trip its rate limit.
// We de-duplicate in-flight fetches per key: the first caller runs the
// fetch, everyone else awaits the same promise.
const inflight = new Map<string, Promise<unknown>>();

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();

  if (redis) {
    try {
      const value = await redis.get<T>(`${PREFIX}${key}`);
      return value ?? null;
    } catch {
      // Redis unreachable — fall through to in-memory
    }
  }

  // In-memory fallback
  const hit = memStore.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    memStore.delete(key);
    return null;
  }
  return hit.value as T;
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlMs: number
): Promise<void> {
  const redis = getRedis();

  if (redis) {
    try {
      await redis.set(`${PREFIX}${key}`, value, { px: ttlMs });
      return;
    } catch {
      // Redis unreachable — fall through to in-memory
    }
  }

  // In-memory fallback
  memStore.set(key, { value, expires: Date.now() + ttlMs });
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const existing = await cacheGet<T>(key);
  if (existing !== null) return existing;

  // De-duplicate concurrent fetches for the same key.
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    try {
      const value = await fn();
      await cacheSet(key, value, ttlMs);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
