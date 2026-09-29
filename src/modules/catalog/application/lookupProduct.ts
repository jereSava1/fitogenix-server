import type { CachedProduct, ProductCache, ProductReader } from './ports';
import { toProductDetail, type ProductDetail } from './productResponse';
import { isBarcode, nameKey } from '../domain/query';

/**
 * Solo lectura del catálogo propio (Redis adelante, Supabase atrás). Si no está, `null`:
 * el catálogo crece por el ETL, no por las búsquedas. */

export type LookupProduct = (query: string) => Promise<ProductDetail | null>;

type LookupSource = 'redis' | 'supabase' | 'catalog';

// `source`: el nivel que sirvió esta request. `dataSource`: el proveedor original del dato.
function logSource(cacheKey: string, source: LookupSource, dataSource: string): void {
  console.info(JSON.stringify({ event: 'product_lookup', cacheKey, source, dataSource }));
}

/** Redis y la base guardan crudos: los dos se presentan igual. `id` = uuid de la fila;
 *  la query es el nombre de reemplazo. */
function present(cached: CachedProduct, query: string): ProductDetail {
  return toProductDetail(cached.raw, { id: cached.productId, fallbackName: query });
}

/** Los productos de origen IA se refrescan antes: el dato es menos confiable. */
function ttlFor(dataSource: string): number {
  return dataSource === 'ai' ? 259200 : 604800;
}

function toCached(cached: CachedProduct): CachedProduct {
  return { productId: cached.productId, dataSource: cached.dataSource, raw: cached.raw };
}

export function makeLookupProduct(deps: {
  reader: ProductReader;
  cache: ProductCache;
}): LookupProduct {
  const { reader, cache } = deps;

  // Deduplicación in-flight (singleflight): si varias requests piden la misma
  // clave a la vez, comparten una sola resolución en curso. Keyed por la clave
  // interna de proceso (barcode o 'name:<...>').
  const inFlight = new Map<string, Promise<ProductDetail | null>>();

  async function withSingleflight(
    cacheKey: string,
    resolve: () => Promise<ProductDetail | null>,
  ): Promise<ProductDetail | null> {
    const existing = inFlight.get(cacheKey);
    if (existing) return existing;

    const promise = resolve().finally(() => inFlight.delete(cacheKey));
    inFlight.set(cacheKey, promise);
    return promise;
  }

  async function resolveByBarcode(
    barcode: string,
    originalQuery: string,
  ): Promise<ProductDetail | null> {
    return withSingleflight(barcode, async () => {
      // Nivel 1: Redis (crudos; otro formato es miss).
      const redisHit = await cache.get(barcode);
      if (redisHit) {
        logSource(barcode, 'redis', redisHit.dataSource);
        return present(redisHit, originalQuery);
      }

      // Level 2 — Supabase (catálogo). Único nivel de resolución: si no está
      // acá, no está — no hay cascada externa (ver el comentario de arriba).
      const cached = await reader.findByBarcode(barcode);
      if (!cached) return null;

      const product = present(cached, originalQuery);
      logSource(barcode, 'supabase', cached.dataSource);

      cache.set(barcode, toCached(cached), ttlFor(cached.dataSource)).catch((err: unknown) =>
        console.error('[productLookupService] setInRedis error:', err),
      );

      return product;
    });
  }

  async function resolveByName(trimmed: string): Promise<ProductDetail | null> {
    const cacheKey = nameKey(trimmed);

    return withSingleflight(cacheKey, async () => {
      // Nivel 1: Redis, bajo la clave de esta query.
      const redisHit = await cache.get(cacheKey);
      if (redisHit) {
        logSource(cacheKey, 'redis', redisHit.dataSource);
        return present(redisHit, trimmed);
      }

      // Level 2 — búsqueda por nombre en el catálogo (índice trigram + ranking
      // por similitud, ver migración 014). Único nivel de resolución para
      // texto: sin match acá, el producto todavía no está en el catálogo.
      const cached = await reader.findByName(trimmed);
      if (!cached) return null;

      const product = present(cached, trimmed);
      logSource(cacheKey, 'catalog', cached.dataSource);

      if (cached.barcode) {
        // Con barcode alcanza con recordar query → barcode: la próxima vez se resuelve por barcode.
        cache.setBarcodeForQuery(trimmed, cached.barcode).catch((err: unknown) =>
          console.error('[productLookupService] setSearchBarcode error:', err),
        );
      } else {
        // Fila solo-nombre (sin barcode, típicamente resuelta por IA en su
        // momento): la única forma de encontrarla rápido de nuevo es cachear
        // bajo la clave de ESTA query.
        cache.set(cacheKey, toCached(cached), ttlFor(cached.dataSource)).catch((err: unknown) =>
          console.error('[productLookupService] setInRedis error:', err),
        );
      }

      return product;
    });
  }

  return async function lookupProduct(query: string): Promise<ProductDetail | null> {
    const trimmed = String(query).trim();

    if (isBarcode(trimmed)) {
      return resolveByBarcode(trimmed, trimmed);
    }

    // Si otra búsqueda ya resolvió esta query a un barcode, saltamos derecho a
    // ese camino (Redis/Supabase por barcode) en vez de repetir la búsqueda por
    // nombre.
    const cachedBarcode = await cache.getBarcodeForQuery(trimmed);
    if (cachedBarcode) {
      return resolveByBarcode(cachedBarcode, trimmed);
    }

    return resolveByName(trimmed);
  };
}
