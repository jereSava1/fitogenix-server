// Admin API de Supabase Auth, con el cliente admin compartido.

import { supabaseAdmin } from '../../../platform/supabase';
import { DeleteUserError, type AuthAdmin } from '../application/ports';

export const supabaseAuthAdmin: AuthAdmin = {
  async deleteUser(userId) {
    const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
    if (error) throw new DeleteUserError(error.message);
  },
};
