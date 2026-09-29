// Puertos del catálogo (ADR-0002). Implementaciones en infrastructure/.

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

/** Lectura de `products`. Un error de Supabase hoy es `null` (miss); cambia en H-01. */
export interface ProductReader {
  /** Por uuid (`products.id`). */
  findById(id: string): Promise<CachedProductRow | null>;
  findByBarcode(barcode: string): Promise<CachedProductRow | null>;
  /** El mejor match por nombre (RPC `search_products_by_name`). Normaliza el
   *  query adentro; con menos de 3 caracteres normalizados devuelve `null`. */
  findByName(query: string): Promise<CachedProductRow | null>;
}

/** Lo que guarda el cache: el crudo con identidad y origen, como lo devuelve la base. */
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
