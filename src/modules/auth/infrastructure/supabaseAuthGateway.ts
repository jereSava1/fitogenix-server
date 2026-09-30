// Supabase Auth. Lo que abre una sesión de usuario va en un cliente descartable, nunca en el admin.

import { DependencyUnavailableError } from '../../../platform/dependencyError';
import { supabaseAdmin, supabaseAuthClient } from '../../../platform/supabase';
import type { AuthGateway } from '../application/ports';

type AuthFailure = { status?: number; code?: string; message: string };

/** Solo un 4xx dice algo del pedido; red, timeout o 5xx son Auth caído. */
function rejected(error: AuthFailure): boolean {
  return !!error.status && error.status >= 400 && error.status < 500;
}

function unavailable(what: string, cause: unknown): DependencyUnavailableError {
  const detail = cause && typeof cause === 'object' && 'message' in cause ? `${what}: ${String(cause.message)}` : what;
  return new DependencyUnavailableError('auth', detail, { cause });
}

async function call<R>(what: string, run: () => Promise<R>): Promise<R> {
  try {
    return await run();
  } catch (err) {
    throw unavailable(what, err);
  }
}

export const supabaseAuthGateway: AuthGateway = {
  async sendPasswordResetCode(email) {
    const { error } = await call('resetPasswordForEmail', () =>
      supabaseAuthClient().auth.resetPasswordForEmail(email),
    );
    // Un 4xx (incluido su propio límite de envíos) no se cuenta: revelaría si el email existe.
    if (error && !rejected(error)) throw unavailable('resetPasswordForEmail', error);
  },

  async resetPassword(email, code, newPassword) {
    const client = supabaseAuthClient();
    const verified = await call('verifyOtp', () =>
      client.auth.verifyOtp({ email, token: code, type: 'recovery' }),
    );
    if (verified.error) {
      if (!rejected(verified.error)) throw unavailable('verifyOtp', verified.error);
      return verified.error.status === 429 ? 'rate_limited' : 'invalid_code';
    }

    const updated = await call('updateUser', () => client.auth.updateUser({ password: newPassword }));
    // La sesión de recuperación no se usa más: se revoca aunque el cambio haya fallado.
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    if (updated.error) {
      if (!rejected(updated.error)) throw unavailable('updateUser', updated.error);
      return updated.error.code === 'same_password' ? 'same_password' : 'weak_password';
    }
    return 'ok';
  },

  async signUp(email, password) {
    const client = supabaseAuthClient();
    const { data, error } = await call('signUp', () => client.auth.signUp({ email, password }));
    if (error) {
      if (!rejected(error)) throw unavailable('signUp', error);
      if (error.status === 429) return 'rate_limited';
      if (error.code === 'user_already_exists' || error.code === 'email_exists') return 'email_taken';
      if (error.code === 'weak_password') return 'weak_password';
      return 'rejected';
    }
    // Sin confirmación de email Auth abre una sesión: no se usa.
    if (data.session) await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    if (!data.user) throw unavailable('signUp', { message: 'respuesta sin usuario' });
    return { userId: data.user.id };
  },

  async deleteUser(userId) {
    const { error } = await call(`deleteUser ${userId}`, () => supabaseAdmin().auth.admin.deleteUser(userId));
    // 404: ya no existe, no hay nada que deshacer.
    if (error && error.status !== 404) throw unavailable(`deleteUser ${userId}`, error);
  },
};
