/**
 * Productos guardados por usuario (favoritos).
 *
 * Persiste en la tabla `saved_products` (migración 004): cada guardado
 * referencia la fila cacheada en `products` vía `cache_key`. El listado se
 * sirve con un embed de PostgREST (saved_products → products, habilitado por
 * la FK a products.cache_key) y cada producto se recomputa con el MISMO
 * pipeline que un hit de cache: rowToCachedRaw + mapOFFToProduct.
 *
 * Lógica extraída de las rutas (src/routes/users/saved.ts) para testearla
 * unitariamente sin levantar Fastify ni mockear el plugin de auth.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { joinedRowToProduct } from './productRowMapper';
import type { FitogenixProduct } from '../types/fitogenix';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: ReturnType<typeof createClient<any>> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): ReturnType<typeof createClient<any>> => {
  if (!_admin) _admin = createClient(config.supabaseUrl, config.supabaseSecretKey);
  return _admin;
};

export type SaveResult = 'ok' | 'not_found';

/**
 * Lista los guardados del usuario, más reciente primero, como
 * FitogenixProduct completos (score recomputado desde los crudos).
 *
 * Filas cuyo producto embebido no tiene crudos o falta (joinedRowToProduct →
 * null) se OMITEN del listado: mejor una lista corta que productos con
 * breakdown incompleto. Errores de DB se propagan como Error (la ruta
 * responde 500).
 */
export async function listSavedProducts(userId: string): Promise<FitogenixProduct[]> {
  const { data, error } = await admin()
    .from('saved_products')
    // Embed habilitado por la FK saved_products.cache_key → products.cache_key.
    .select('cache_key, created_at, products(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`saved_products select: ${error.message}`);

  const rows: unknown[] = Array.isArray(data) ? data : [];
  const items: FitogenixProduct[] = [];

  for (const rowUnknown of rows) {
    const product = joinedRowToProduct(rowUnknown);
    if (product) items.push(product);
  }

  return items;
}

/**
 * Guarda un producto para el usuario. Idempotente: si ya estaba guardado,
 * el upsert con ignoreDuplicates lo deja como está y devuelve 'ok'.
 * Devuelve 'not_found' si el cacheKey no existe en `products` (violación de
 * FK, código PostgreSQL 23503). Otros errores de DB se propagan como Error.
 */
export async function saveProduct(userId: string, cacheKey: string): Promise<SaveResult> {
  const { error } = await admin()
    .from('saved_products')
    .upsert(
      { user_id: userId, cache_key: cacheKey },
      { onConflict: 'user_id,cache_key', ignoreDuplicates: true },
    );

  if (error) {
    const message = typeof error.message === 'string' ? error.message : '';
    if (error.code === '23503' || message.includes('23503')) return 'not_found';
    throw new Error(`saved_products upsert: ${message}`);
  }

  return 'ok';
}

/**
 * Quita un producto de los guardados del usuario. Idempotente: borrar algo
 * que no estaba guardado no es error. Errores de DB se propagan como Error.
 */
export async function removeSavedProduct(userId: string, cacheKey: string): Promise<void> {
  const { error } = await admin()
    .from('saved_products')
    .delete()
    .eq('user_id', userId)
    .eq('cache_key', cacheKey);

  if (error) throw new Error(`saved_products delete: ${error.message}`);
}
