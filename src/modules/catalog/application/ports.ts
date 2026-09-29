/* Puertos del catálogo (docs/02-arquitectura.md §8.2, ADR-0002).
 *
 * Describen lo que el lookup necesita de la base y de Redis, TAL COMO SE
 * COMPORTA HOY (M-04 es una mudanza, sin cambios de comportamiento). La forma
 * objetivo de §8.2 llega por partes: `findById` para `GET /v1/products/:id`
 * llegó en K-04; las fallas técnicas como `DependencyUnavailableError` en vez
 * de "miss" llegan en H-01.
 * Los implementan `infrastructure/supabaseProductReader.ts` y
 * `infrastructure/redisProductCache.ts`; los casos de uso los reciben.
 */

import type { RawProduct } from '../domain/rawProduct';

// Lo que devuelve la lectura del cache: los datos CRUDOS reconstruidos como
// un RawProduct (para que pasen por el MISMO `toProductDetail` que un lookup
// fresco) más el dataSource de la fila. El score NO se guarda: se recomputa.
export type CachedRaw = {
  raw: RawProduct;
  dataSource: string;
};

// Fila de `products` reconstruida con su identidad y atributos de búsqueda.
// `productId` = products.id (uuid, la identidad — migración 006); `barcode` y
// `nameKey` son los atributos de búsqueda (ambos nullable).
export type CachedProductRow = CachedRaw & {
  productId: string;
  barcode: string | null;
  nameKey: string | null;
};

/** Lectura de `products`. Hoy un error de Supabase se devuelve como `null`
 *  (miss): caracterizado en T-06, cambia en H-01. */
export interface ProductReader {
  /** Por identidad (`products.id`, uuid): el detalle de un guardado o del
   *  historial (K-04). */
  findById(id: string): Promise<CachedProductRow | null>;
  findByBarcode(barcode: string): Promise<CachedProductRow | null>;
  /** El mejor match por nombre (RPC `search_products_by_name`). Normaliza el
   *  query adentro; con menos de 3 caracteres normalizados devuelve `null`. */
  findByName(query: string): Promise<CachedProductRow | null>;
}

/** Lo que guarda el cache: el producto crudo con su identidad y su origen,
 *  lo mismo que devuelve la base (K-02, D-45). */
export type CachedProduct = Pick<CachedProductRow, 'raw' | 'dataSource' | 'productId'>;

/** Cache Redis de productos crudos (el lookup los recalcula al leer). Todo
 *  método falla en silencio (miss o no-op), y no hace nada si Redis no está
 *  configurado. */
export interface ProductCache {
  get(key: string): Promise<CachedProduct | null>;
  set(key: string, cached: CachedProduct, ttlSeconds?: number): Promise<void>;
  getBarcodeForQuery(query: string): Promise<string | null>;
  setBarcodeForQuery(query: string, barcode: string): Promise<void>;
}
