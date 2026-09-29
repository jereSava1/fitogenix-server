// Lector del catálogo: tabla `products` y RPC `search_products_by_name`.
// Un error de Supabase hoy se devuelve como miss (`null`); cambia en H-01.

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

/** Por uuid. */
export async function getProductById(id: string): Promise<CachedProductRow | null> {
  return getCachedBy('id', id);
}

/** Lee un producto cacheado por su barcode y reconstruye su crudo. */
export async function getCachedProductByBarcode(
  barcode: string,
): Promise<CachedProductRow | null> {
  return getCachedBy('barcode', barcode);
}

/** El mejor match por nombre en el catálogo propio. Busca y ordena Postgres (índice
 *  trigram, orden por similitud). */
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
