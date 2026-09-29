/**
 * Historial de escaneos por usuario: tabla `scan_history`.
 *
 * Persiste en la tabla `scan_history` (migraciones 005 + 006): cada escaneo
 * autenticado referencia la fila cacheada en `products` vía `product_id`
 * (uuid, la identidad del producto). El listado se sirve con el mismo embed
 * que los guardados.
 *
 * Implementa `HistoryRepository` (application/ports.ts). Antes era
 * `services/scanHistoryService.ts`; se partió en M-06 sin cambios.
 * `resolveUserIdFromToken`, que también vivía ahí, pasó a
 * `platform/http/auth.ts`.
 */

import { supabaseAdmin as admin } from '../../../platform/supabase';
import type { HistoryRepository } from '../application/ports';

export const supabaseHistoryRepository: HistoryRepository = {
  async list(userId, limit) {
    const { data, error } = await admin()
      .from('scan_history')
      // Embed habilitado por la FK scan_history.product_id → products.id.
      .select('product_id, scanned_at, products(*)')
      .eq('user_id', userId)
      .order('scanned_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`scan_history select: ${error.message}`);

    return Array.isArray(data) ? data : [];
  },

  /**
   * Upsert sobre (user_id, product_id): si ya existía la fila, ACTUALIZA
   * scanned_at — por eso NO usa ignoreDuplicates, a diferencia del upsert de
   * guardados.
   *
   * Nunca lanza: es un side-effect fire-and-forget del lookup. El lookup solo
   * lee del catálogo, así que la violación de FK (23503) solo puede pasar si el
   * producto se borró de `products` entre el lookup y este upsert; no es
   * crítico — el próximo escaneo lo registra — así que solo se loguea.
   */
  async upsert(userId, productId, at) {
    try {
      const { error } = await admin()
        .from('scan_history')
        .upsert(
          { user_id: userId, product_id: productId, scanned_at: at.toISOString() },
          { onConflict: 'user_id,product_id' },
        );

      if (error) {
        console.error(`scan_history upsert (${productId}): ${error.message}`);
      }
    } catch (err) {
      console.error(`scan_history upsert (${productId}):`, err);
    }
  },
};
