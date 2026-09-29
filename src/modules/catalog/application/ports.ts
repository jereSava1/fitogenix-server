/* Puertos del catálogo (docs/02-arquitectura.md §8.2, ADR-0002).
 *
 * Describen lo que el lookup necesita de la base y de Redis, TAL COMO SE
 * COMPORTA HOY (M-04 es una mudanza, sin cambios de comportamiento). La forma
 * objetivo de §8.2 llega por partes:
 *   - fallas técnicas como `DependencyUnavailableError` en vez de "miss" → H-01;
 *   - Redis guarda los crudos (`RawProduct` + `id`), no la respuesta armada → K-02;
 *   - `findById` para `GET /v1/products/:id` → K-04.
 * Los implementan `infrastructure/supabaseProductReader.ts` y
 * `infrastructure/redisProductCache.ts`; el caso de uso los recibe en M-05.
 */

import type { FitogenixProduct } from './productResponse';
import type { RawProduct } from '../domain/rawProduct';

// Lo que devuelve la lectura del cache: los datos CRUDOS reconstruidos como
// un RawProduct (para que pasen por el MISMO mapRawToProduct que un lookup
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
  findByBarcode(barcode: string): Promise<CachedProductRow | null>;
  /** El mejor match por nombre (RPC `search_products_by_name`). Normaliza el
   *  query adentro; con menos de 3 caracteres normalizados devuelve `null`. */
  findByName(query: string): Promise<CachedProductRow | null>;
}

/** Cache Redis de respuestas armadas. Todo método falla en silencio (miss o
 *  no-op), y no hace nada si Redis no está configurado. */
export interface ProductCache {
  get(key: string): Promise<FitogenixProduct | null>;
  set(key: string, product: FitogenixProduct, ttlSeconds?: number): Promise<void>;
  getBarcodeForQuery(query: string): Promise<string | null>;
  setBarcodeForQuery(query: string, barcode: string): Promise<void>;
}
