// Tabla `scan_history`: cada escaneo autenticado referencia `products` por `product_id`.

import { queryFailed, runQuery, supabaseAdmin as admin } from '../../../platform/supabase';
import type { HistoryRepository } from '../application/ports';

export const supabaseHistoryRepository: HistoryRepository = {
  async list(userId, limit) {
    const { data, error } = await runQuery('scan_history select', () =>
      admin()
        .from('scan_history')
        // Embed habilitado por la FK scan_history.product_id → products.id.
        .select('product_id, scanned_at, products(*)')
        .retry(false)
        .eq('user_id', userId)
        .order('scanned_at', { ascending: false })
        .limit(limit),
    );

    if (error) throw queryFailed('scan_history select', error);

    return Array.isArray(data) ? data : [];
  },

  /** Upsert que actualiza `scanned_at` (sin ignoreDuplicates). Nunca lanza: una FK rota
   *  (producto borrado en el medio) solo se loguea. */
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

  /** Idempotente: borrar algo que no estaba en el historial no es error. */
  async remove(userId, productId) {
    const { error } = await runQuery('scan_history delete', () =>
      admin().from('scan_history').delete().eq('user_id', userId).eq('product_id', productId),
    );

    if (error) throw queryFailed('scan_history delete', error);
  },
};
