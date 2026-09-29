/**
 * Productos guardados por usuario (favoritos): tabla `saved_products`.
 *
 * Persiste en la tabla `saved_products` (migraciones 004 + 006): cada guardado
 * referencia la fila cacheada en `products` vía `product_id` (uuid, la
 * identidad del producto). El listado se sirve con un embed de PostgREST
 * (saved_products → products, habilitado por la FK a products.id); el caso de
 * uso (`application/saved.ts`) recomputa cada producto con el MISMO pipeline
 * que un hit de cache.
 *
 * Implementa `SavedRepository` (application/ports.ts). Antes era
 * `services/savedProductsService.ts`; se partió en M-06 sin cambios.
 */

import { supabaseAdmin as admin } from '../../../platform/supabase';
import type { SavedRepository } from '../application/ports';

export const supabaseSavedRepository: SavedRepository = {
  async list(userId) {
    const { data, error } = await admin()
      .from('saved_products')
      // Embed habilitado por la FK saved_products.product_id → products.id.
      .select('product_id, created_at, products(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`saved_products select: ${error.message}`);

    return Array.isArray(data) ? data : [];
  },

  /**
   * Idempotente: si ya estaba guardado, el upsert con ignoreDuplicates lo deja
   * como está y devuelve 'ok'. Devuelve 'not_found' si el productId no existe
   * en `products` (violación de FK, código PostgreSQL 23503). Otros errores de
   * DB se propagan como Error.
   */
  async add(userId, productId) {
    const { error } = await admin()
      .from('saved_products')
      .upsert(
        { user_id: userId, product_id: productId },
        { onConflict: 'user_id,product_id', ignoreDuplicates: true },
      );

    if (error) {
      const message = typeof error.message === 'string' ? error.message : '';
      if (error.code === '23503' || message.includes('23503')) return 'not_found';
      throw new Error(`saved_products upsert: ${message}`);
    }

    return 'ok';
  },

  /** Idempotente: borrar algo que no estaba guardado no es error. */
  async remove(userId, productId) {
    const { error } = await admin()
      .from('saved_products')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);

    if (error) throw new Error(`saved_products delete: ${error.message}`);
  },
};
