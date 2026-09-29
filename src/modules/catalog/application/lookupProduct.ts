import type { CachedProduct, ProductCache, ProductReader } from './ports';
import { toProductDetail, type ProductDetail } from './productResponse';
import { isBarcode, nameKey } from '../domain/query';

/**
 * Búsqueda de productos — SOLO catálogo propio (decisión de producto,
 * 2026-08-18).
 *
 * Hasta acá había una cascada completa (OFF search → OFF por código → Open
 * Beauty Facts → Edamam → Claude) para cuando el catálogo no tenía el
 * producto. Con el catálogo ahora poblado por el ETL a un volumen mucho
 * mayor, esa cascada dejó de ser necesaria como camino de resolución en vivo:
 * agregaba varios round-trips de red secuenciales (era la causa principal de
 * que una búsqueda "en frío" tardara segundos) y duplicaba trabajo que el ETL
 * ya hace en batch, con curaduría y sin la presión de una request HTTP
 * esperando la respuesta.
 *
 * El resultado: este caso de uso es un camino de SOLO LECTURA contra el
 * catálogo (`ProductReader`, Supabase) con Redis (`ProductCache`) como capa
 * caliente adelante. Si un producto no está en el catálogo, `lookup` devuelve
 * `null` — la ruta responde que todavía no lo tenemos, sin intentar
 * resolverlo con proveedores externos. El catálogo crece por el ETL
 * (`etl/`), no por el tráfico de búsqueda.
 *
 * Antes era `services/productLookupService.ts`, que importaba los adaptadores
 * directo; desde M-05 los recibe como puertos (ADR-0002) y el cableado real
 * vive en `modules/catalog/index.ts`.
 */

export type LookupProduct = (query: string) => Promise<ProductDetail | null>;

type LookupSource = 'redis' | 'supabase' | 'catalog';

// `source` = nivel que sirvió ESTA request (redis/supabase = barcode exacto;
// catalog = búsqueda por nombre). `dataSource` = proveedor ORIGINAL del dato
// (off/obf/edamam/ai), preservado desde que el ETL lo cargó — sigue siendo
// útil para analítica de origen aunque ya no se resuelva en vivo.
function logSource(cacheKey: string, source: LookupSource, dataSource: string): void {
  console.info(JSON.stringify({ event: 'product_lookup', cacheKey, source, dataSource }));
}

/** El crudo (de Redis o de la base) → la respuesta, con el uuid de la fila
 *  como `id` y la query como nombre de reemplazo. Es el único armado del
 *  lookup: desde K-02 Redis guarda crudos, así que un hit de cache se presenta
 *  igual que uno de Supabase. El origen (`dataSource`) ya no viaja (K-04):
 *  queda para el log y el TTL. */
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
      // Level 1 — Redis (fastest, in-memory cache). Guarda el crudo: se
      // recalcula con el motor y el contrato de hoy (K-02). Las entradas que
      // no tienen ese formato (o sin productId) el adaptador las da como miss.
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
      // Level 1 — Redis, bajo la clave de ESTA query textual (crudo, K-02).
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
        // La fila tiene barcode: la próxima vez que alguien busque este mismo
        // texto, resolveByBarcode la sirve directo desde Redis/Supabase por
        // barcode — no hace falta cachear el producto bajo la clave de texto
        // también (sería una segunda copia que nadie vuelve a leer).
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
