/**
 * Cache Redis del catálogo (Upstash). Guarda el crudo con identidad y origen: la respuesta
 * se arma al leer. Sin UPSTASH_REDIS_REST_* es no-op. TTL: 7 días; origen IA, 3. */

import { getRedis } from '../../../platform/redis';
import type { CachedProduct, ProductCache } from '../application/ports';
import { normalizeQuery } from '../domain/query';

const REDIS_KEY_PREFIX = 'ftg:product:';
const SEARCH_KEY_PREFIX = 'ftg:search:';
const SEARCH_TTL_SECONDS = 2592000; // 30 días

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lo que había en la clave → el crudo, o `null` (miss) si no tiene esa forma. */
export function parseCachedProduct(value: unknown): CachedProduct | null {
  if (!isRecord(value)) return null;
  const { productId, dataSource, raw } = value;
  if (typeof productId !== 'string' || productId === '') return null;
  if (typeof dataSource !== 'string') return null;
  if (!isRecord(raw)) return null;
  return { productId, dataSource, raw: raw as CachedProduct['raw'] };
}

export async function getFromRedis(key: string): Promise<CachedProduct | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const value = await redis.get<unknown>(REDIS_KEY_PREFIX + key);
    if (value == null) return null;

    const cached = parseCachedProduct(value);
    if (!cached) {
      // Otro formato: evento propio y no error, para ver la curva de repoblado.
      console.info(JSON.stringify({ event: 'redis_stale_format', cacheKey: key }));
    }
    return cached;
  } catch (err) {
    console.error('[redisService] getFromRedis error:', err);
    return null;
  }
}

export async function setInRedis(
  key: string,
  cached: CachedProduct,
  ttlSeconds = 604800,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const value: CachedProduct = {
      productId: cached.productId,
      dataSource: cached.dataSource,
      raw: cached.raw,
    };
    await redis.set(REDIS_KEY_PREFIX + key, value, { ex: ttlSeconds });
  } catch (err) {
    console.error('[redisService] setInRedis error:', err);
  }
}

// Cache query → barcode: evita repetir la búsqueda por nombre. No depende del motor.

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

export const redisProductCache: ProductCache = {
  get: getFromRedis,
  set: setInRedis,
  getBarcodeForQuery: getSearchBarcode,
  setBarcodeForQuery: setSearchBarcode,
};
