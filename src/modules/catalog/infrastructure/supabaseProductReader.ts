/* Lector del catálogo: tabla `products` y RPC `search_products_by_name`.
 *
 * Implementa `ProductReader` (application/ports.ts). Antes vivía en
 * `services/cacheService.ts`; se mudó en M-04 sin cambios de comportamiento:
 * un error de Supabase sigue devolviéndose como miss (`null`), lo que
 * caracteriza T-06 y corrige H-01.
 */

import { supabaseAdmin as admin } from '../../../platform/supabase';
import type { CachedProductRow, ProductReader } from '../application/ports';
import { normalizeQuery } from '../domain/query';
import { rowToCachedRaw } from './productRow';

// Lectura común: una fila por columna única (id, barcode o name_key).
async function getCachedBy(
  column: 'id' | 'barcode' | 'name_key',
  value: string,
): Promise<CachedProductRow | null> {
  const { data, error } = await admin()
    .from('products')
    .select('*')
    .eq(column, value)
    .maybeSingle();

  if (error || !data) return null;

  return rowToCachedRaw(data as Record<string, unknown>);
}

/** Lee un producto por su identidad (uuid) y reconstruye su crudo (K-04). Un
 *  error de Supabase se devuelve como `null`, igual que por barcode, hasta
 *  H-01. */
export async function getProductById(id: string): Promise<CachedProductRow | null> {
  return getCachedBy('id', id);
}

/** Lee un producto cacheado por su barcode y reconstruye su crudo. */
export async function getCachedProductByBarcode(
  barcode: string,
): Promise<CachedProductRow | null> {
  return getCachedBy('barcode', barcode);
}

/**
 * Busca en NUESTRO catálogo (`products`) el producto cuyo nombre mejor
 * matchee el query de texto. Desde 2026-08-18 es el ÚNICO mecanismo de
 * resolución por nombre — no hay cascada a OFF ni a la IA: si no aparece acá,
 * el producto todavía no está en el catálogo.
 *
 * La búsqueda y el ranking corren en Postgres (RPC `search_products_by_name`,
 * migración 014): índice GIN trigram sobre `product_name` en vez de un
 * sequential scan, y orden por similitud real en vez de `updated_at`. Ver el
 * comentario de la migración para el porqué.
 */
export async function findCachedProductByName(
  query: string,
): Promise<CachedProductRow | null> {
  const normalized = normalizeQuery(query);
  // Guard: queries demasiado cortos matchearían medio catálogo ("a", "co").
  if (normalized.length < 3) return null;

  const { data, error } = await admin().rpc('search_products_by_name', {
    search_query: normalized,
    match_limit: 5,
  });

  if (error || !data || data.length === 0) return null;

  // Candidatas = filas con crudos reconstruibles; el resto son cache miss.
  // El RPC ya devuelve las filas ordenadas por similitud (mejor match primero),
  // así que la primera candidata reconstruible es la respuesta.
  for (const row of data as Record<string, unknown>[]) {
    const cached = rowToCachedRaw(row);
    if (cached) return cached;
  }

  return null;
}

export const supabaseProductReader: ProductReader = {
  findById: getProductById,
  findByBarcode: getCachedProductByBarcode,
  findByName: findCachedProductByName,
};
