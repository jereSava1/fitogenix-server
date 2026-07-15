/**
 * Mapeo compartido: fila con producto embebido (PostgREST) → FitogenixProduct.
 *
 * Tanto saved_products como scan_history referencian `products` vía
 * `product_id` (migración 006) y listan con un embed
 * (`<tabla>(product_id, ..., products(*))`). Este módulo concentra la
 * reconstrucción del producto para que ambos listados apliquen EXACTAMENTE el
 * mismo pipeline que un hit de cache: rowToCachedRaw + mapOFFToProduct +
 * preservar dataSource/productId.
 *
 * Vive aparte (y no en cacheService) porque necesita mapOFFToProduct de
 * productLookupService, que a su vez importa cacheService: meterlo ahí
 * crearía un import circular.
 */

import { rowToCachedRaw } from './cacheService';
import { mapOFFToProduct } from './productLookupService';
import type { FitogenixProduct } from '../types/fitogenix';

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Reconstruye un FitogenixProduct desde una fila join { product_id, products }.
 *
 * Devuelve null si la fila no tiene la forma esperada, si el producto
 * embebido falta (p.ej. purgado entre el join y la lectura) o si la fila de
 * `products` no tiene id o crudos (rowToCachedRaw → null): mejor omitir que
 * servir productos con breakdown incompleto.
 */
export function joinedRowToProduct(rowUnknown: unknown): FitogenixProduct | null {
  const row = asRecord(rowUnknown);
  if (!row) return null;

  // PostgREST embebe la relación many-to-one como objeto; toleramos array
  // (forma que usa para to-many) tomando el primer elemento.
  const embedded = Array.isArray(row.products) ? row.products[0] : row.products;
  const productRow = asRecord(embedded);
  if (!productRow) return null;

  const cached = rowToCachedRaw(productRow);
  if (!cached) return null; // fila sin id o sin crudos → se omite

  // Mismo tratamiento que el hit de Supabase en productLookupService:
  // recomputar con mapOFFToProduct y preservar dataSource/productId.
  const product = mapOFFToProduct(cached.raw, cached.productId);
  product.dataSource = cached.dataSource;
  product.productId = cached.productId;
  return product;
}
