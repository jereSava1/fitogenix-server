/* Admin API de Supabase Auth. Implementa `AuthAdmin` (application/ports.ts).
 *
 * Usa el cliente admin compartido (`platform/supabase.ts`): hasta M-07 la ruta
 * creaba un cliente nuevo en cada request, con la misma URL y la misma key.
 */

import { supabaseAdmin } from '../../../platform/supabase';
import { DeleteUserError, type AuthAdmin } from '../application/ports';

export const supabaseAuthAdmin: AuthAdmin = {
  async deleteUser(userId) {
    const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
    if (error) throw new DeleteUserError(error.message);
  },
};
