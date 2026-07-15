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

import { Redis } from "@upstash/redis";

// ─── Key prefix to avoid collisions if the Upstash DB is shared ────────────
const PREFIX = "rh:";

// ─── Redis client (lazy singleton, null when env vars are missing) ──────────
let _redis: Redis | null | undefined; // undefined = not yet initialized

function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    _redis = new Redis({ url, token });
  } else {
    _redis = null;
  }

  return _redis;
}

// ─── In-memory fallback (original behaviour) ────────────────────────────────
type Entry<T> = { expires: number; value: T };
const memStore = new Map<string, Entry<unknown>>();

// ─── Public API (same signatures, now async) ────────────────────────────────

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
  const value = await fn();
  await cacheSet(key, value, ttlMs);
  return value;
}
