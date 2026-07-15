/**
 * Historial de escaneos por usuario.
 *
 * Persiste en la tabla `scan_history` (migraciones 005 + 006): cada escaneo
 * autenticado referencia la fila cacheada en `products` vía `product_id`
 * (uuid, la identidad del producto). Re-escanear un producto NO agrega fila:
 * el upsert actualiza scanned_at, así la tabla queda acotada a productos
 * distintos por usuario.
 *
 * El registro se dispara fire-and-forget desde POST /products/lookup
 * (src/routes/products/lookup.ts): NUNCA debe demorar ni romper la respuesta
 * del lookup, por eso recordScan loguea errores en vez de propagarlos.
 * El listado se sirve en GET /users/me/history (src/routes/users/history.ts)
 * con el mismo embed + mapeo que los guardados (productRowMapper).
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

/**
 * Registra (o refresca) un escaneo del usuario. Upsert sobre
 * (user_id, product_id): si ya existía la fila, ACTUALIZA scanned_at — por eso
 * NO usa ignoreDuplicates, a diferencia del upsert de guardados.
 *
 * Nunca lanza: es un side-effect fire-and-forget del lookup. La violación de
 * FK (23503) hoy solo puede pasar si el producto se purgó del cache entre el
 * lookup y este upsert (el cold path AWAITEA setCachedProduct desde la
 * migración 006, así que el viejo race "producto todavía no cacheado" ya no
 * existe); no es crítico — el próximo escaneo lo registra — así que solo se
 * loguea.
 */
export async function recordScan(userId: string, productId: string): Promise<void> {
  try {
    const { error } = await admin()
      .from('scan_history')
      .upsert(
        { user_id: userId, product_id: productId, scanned_at: new Date().toISOString() },
        { onConflict: 'user_id,product_id' },
      );

    if (error) {
      console.error(`scan_history upsert (${productId}): ${error.message}`);
    }
  } catch (err) {
    console.error(`scan_history upsert (${productId}):`, err);
  }
}

/**
 * Resuelve el userId desde un access token de Supabase. Devuelve null si el
 * token es inválido o expiró — SIN loguear error: un token vencido en un
 * lookup (que degrada a anónimo) es un caso normal, no una falla.
 */
export async function resolveUserIdFromToken(token: string): Promise<string | null> {
  try {
    const { data, error } = await admin().auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * Lista el historial del usuario, escaneo más reciente primero, como
 * FitogenixProduct completos (score recomputado desde los crudos).
 *
 * Filas cuyo producto embebido falta o no tiene crudos se OMITEN (mismo
 * criterio que listSavedProducts). Errores de DB se propagan como Error
 * (la ruta responde 500).
 */
export async function listScanHistory(
  userId: string,
  limit: number,
): Promise<FitogenixProduct[]> {
  const { data, error } = await admin()
    .from('scan_history')
    // Embed habilitado por la FK scan_history.product_id → products.id.
    .select('product_id, scanned_at, products(*)')
    .eq('user_id', userId)
    .order('scanned_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`scan_history select: ${error.message}`);

  const rows: unknown[] = Array.isArray(data) ? data : [];
  const items: FitogenixProduct[] = [];

  for (const rowUnknown of rows) {
    const product = joinedRowToProduct(rowUnknown);
    if (product) items.push(product);
  }

  return items;
}
