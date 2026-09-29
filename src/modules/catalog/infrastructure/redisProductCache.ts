/**
 * Cache Redis del catálogo (Upstash REST). Implementa `ProductCache`
 * (application/ports.ts). Antes era `services/redisService.ts` (M-04); su
 * `normalizeQuery` propia, distinta de `domain/query.ts`, se unifica en H-04.
 *
 * Todas las funciones son no-op cuando faltan UPSTASH_REDIS_REST_URL / TOKEN,
 * así el servidor corre sin Redis en desarrollo.
 *
 * TTLs (ver application/lookupProduct.ts):
 *   Producto normal : 7 días  (604800 s)
 *   Origen IA       : 3 días  (259200 s)
 *
 * ── Qué se guarda: los datos crudos (K-02, D-45) ──
 *
 * `ftg:product:<clave>` guarda lo mismo que devuelve la base: el producto
 * CRUDO (`raw`) con su identidad (`productId`) y su origen (`dataSource`). El
 * lookup lo pasa por `mapRawToProduct` en cada lectura, igual que un hit de
 * Supabase, así que el cache no depende ni del motor ni del contrato: un
 * cambio de puntaje o un campo nuevo en la respuesta no dejan entradas que
 * haya que invalidar.
 *
 * Hasta K-02 se guardaba la respuesta ya armada (`FitogenixProduct`) adentro
 * de un sobre `{ engineVersion, product }`, y toda entrada de otro motor era
 * miss. Con eso tampoco se cubría un campo requerido nuevo del contrato: la
 * entrada vieja no lo tenía y ese producto respondía 500 hasta que venciera
 * su TTL (03-contratos §B.4.1). Las entradas con el formato viejo (o
 * cualquier cosa que no sea un crudo) se leen como MISS, sin error, y el
 * nivel Supabase las pisa con el formato nuevo en la misma clave.
 */

import { getRedis } from '../../../platform/redis';
import type { CachedProduct, ProductCache } from '../application/ports';

const REDIS_KEY_PREFIX = 'ftg:product:';
const SEARCH_KEY_PREFIX = 'ftg:search:';
const SEARCH_TTL_SECONDS = 2592000; // 30 días

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lo que había en la clave → el producto crudo, o `null` (miss) si no tiene
 * la forma que escribe `setInRedis`. Función PURA, exportada para testear sin
 * levantar Redis. No mira la versión del motor ni los campos de la respuesta:
 * el crudo se recalcula al leer.
 */
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
      // Entrada con otro formato (la respuesta armada de antes de K-02). Se
      // loguea como evento propio (no como error) porque el día del deploy va
      // a pasar con TODO el catálogo: sirve para ver la curva de repoblado.
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

// ── Cache texto→barcode ──
// Evita repetir la búsqueda por nombre en el catálogo cuando otro usuario ya
// resolvió la misma query a un barcode.
//
// Este cache NO se versiona por motor a propósito: mapea query → código de
// barras, un dato del mundo (qué producto es) que no depende de cómo lo
// puntuamos.

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
