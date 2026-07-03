/**
 * Redis cache service (Upstash REST).
 *
 * Both functions are no-ops when UPSTASH_REDIS_REST_URL / TOKEN are not set,
 * so the server works without Redis in development.
 *
 * TTLs (Rubric — productLookupService.ts):
 *   Normal product  : 7 days  (604800 s)
 *   AI-sourced      : 3 days  (259200 s)
 */

import { Redis } from '@upstash/redis';
import { config } from '../config';
import type { FitogenixProduct } from '../types/fitogenix';

const REDIS_KEY_PREFIX = 'ftg:product:';
const SEARCH_KEY_PREFIX = 'ftg:search:';
const SEARCH_TTL_SECONDS = 2592000; // 30 días

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

// Lazily created — only when env vars are present.
let _redis: Redis | null | undefined = undefined; // undefined = not yet checked

function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;

  if (config.upstashRedisUrl && config.upstashRedisToken) {
    _redis = new Redis({
      url: config.upstashRedisUrl,
      token: config.upstashRedisToken,
    });
  } else {
    _redis = null;
  }

  return _redis;
}

export async function getFromRedis(barcode: string): Promise<FitogenixProduct | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get<FitogenixProduct>(REDIS_KEY_PREFIX + barcode);
    return data ?? null;
  } catch (err) {
    console.error('[redisService] getFromRedis error:', err);
    return null;
  }
}

export async function setInRedis(
  barcode: string,
  product: FitogenixProduct,
  ttlSeconds = 604800,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(REDIS_KEY_PREFIX + barcode, product, { ex: ttlSeconds });
  } catch (err) {
    console.error('[redisService] setInRedis error:', err);
  }
}

// ── Cache texto→barcode (Fase 3) ──
// Evita el OFF search (~500ms) cuando otro usuario ya resolvió la misma query.

export async function getSearchBarcode(query: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const code = await redis.get<string>(SEARCH_KEY_PREFIX + normalizeQuery(query));
    return code ?? null;
  } catch (err) {
    console.error('[redisService] getSearchBarcode error:', err);
    return null;
  }
}

export async function setSearchBarcode(query: string, barcode: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(SEARCH_KEY_PREFIX + normalizeQuery(query), barcode, {
      ex: SEARCH_TTL_SECONDS,
    });
  } catch (err) {
    console.error('[redisService] setSearchBarcode error:', err);
  }
}
