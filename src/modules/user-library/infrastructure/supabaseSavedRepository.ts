// Tabla `saved_products`: cada guardado referencia `products` por `product_id`; se lista
// con un embed de PostgREST.

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

  /** Idempotente. `not_found` si el producto no existe (FK, 23503); otro error lanza. */
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
