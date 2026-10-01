/**
 * Cache Redis del catálogo (Upstash). Guarda el crudo con identidad y origen: la respuesta se
 * arma al leer. Sin UPSTASH_REDIS_REST_* es no-op; si falla o tarda más de 200 ms, miss. */

import { logger } from '../../../platform/logger';
import { getRedis, withRedisTimeout } from '../../../platform/redis';
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
    const value = await withRedisTimeout(redis.get<unknown>(REDIS_KEY_PREFIX + key));
    if (value == null) return null;

    const cached = parseCachedProduct(value);
    if (!cached) {
      // Otro formato: evento propio y no error, para ver la curva de repoblado.
      logger.info({ event: 'redis_stale_format', cacheKey: key }, 'redis_stale_format');
    }
    return cached;
  } catch (err) {
    logger.error({ err, cacheKey: key }, 'redis get falló');
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
    await withRedisTimeout(redis.set(REDIS_KEY_PREFIX + key, value, { ex: ttlSeconds }));
  } catch (err) {
    logger.error({ err, cacheKey: key }, 'redis set falló');
  }
}

// Cache query → barcode: evita repetir la búsqueda por nombre. No depende del motor.

export async function getSearchBarcode(query: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const code = await withRedisTimeout(redis.get<string>(SEARCH_KEY_PREFIX + normalizeQuery(query)));
    return code ?? null;
  } catch (err) {
    logger.error({ err }, 'redis getSearchBarcode falló');
    return null;
  }
}

export async function setSearchBarcode(query: string, barcode: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await withRedisTimeout(
      redis.set(SEARCH_KEY_PREFIX + normalizeQuery(query), barcode, { ex: SEARCH_TTL_SECONDS }),
    );
  } catch (err) {
    logger.error({ err }, 'redis setSearchBarcode falló');
  }
}

export const redisProductCache: ProductCache = {
  get: getFromRedis,
  set: setInRedis,
  getBarcodeForQuery: getSearchBarcode,
  setBarcodeForQuery: setSearchBarcode,
};
