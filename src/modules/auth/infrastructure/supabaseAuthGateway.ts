// Supabase Auth. Lo que abre una sesión de usuario va en un cliente descartable, nunca en el admin.

import type { AuthError, Session as SupabaseSession, User } from '@supabase/supabase-js';
import { DependencyUnavailableError } from '../../../platform/dependencyError';
import { supabaseAdmin, supabaseAuthClient } from '../../../platform/supabase';
import type { AuthGateway, Credential, PersonNames, Session } from '../application/ports';

type AuthFailure = Pick<AuthError, 'message'> & { status?: number; code?: string };

/** Solo un 4xx dice algo del pedido; red, timeout o 5xx son Auth caído. */
function rejected(error: AuthFailure): boolean {
  return !!error.status && error.status >= 400 && error.status < 500;
}

function unavailable(what: string, cause: unknown): DependencyUnavailableError {
  const detail = cause && typeof cause === 'object' && 'message' in cause ? `${what}: ${String(cause.message)}` : what;
  return new DependencyUnavailableError('auth', detail, { cause });
}

/** Corre la llamada y deja pasar solo los rechazos (4xx); lo demás es Auth caído. */
async function call<R extends { error: AuthFailure | null }>(what: string, run: () => Promise<R>): Promise<R> {
  let result: R;
  try {
    result = await run();
  } catch (err) {
    throw unavailable(what, err);
  }
  if (result.error && !rejected(result.error)) throw unavailable(what, result.error);
  return result;
}

const isRateLimit = (error: AuthFailure) => error.status === 429;

function toSession(session: SupabaseSession | null, what: string): Session {
  if (!session) throw unavailable(what, { message: 'respuesta sin sesión' });
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    user: { id: session.user.id, email: session.user.email || null },
  };
}

/** Los nombres que manda el proveedor (Google: en el token). Los que manda la app (Apple solo
 *  los da la primera vez) tienen prioridad. */
function namesOf(user: User, credential: Credential): PersonNames {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const [first = null, ...rest] = (text(meta.full_name) ?? text(meta.name) ?? '').split(/\s+/).filter(Boolean);
  const fromProvider = { firstName: text(meta.given_name) ?? first, lastName: text(meta.family_name) ?? (rest.join(' ') || null) };
  const fromApp = credential.kind === 'id_token' ? credential.names : undefined;
  return { firstName: fromApp?.firstName ?? fromProvider.firstName, lastName: fromApp?.lastName ?? fromProvider.lastName };
}

export const supabaseAuthGateway: AuthGateway = {
  async signIn(credential, ip) {
    const client = supabaseAuthClient(ip);
    const what = credential.kind === 'password' ? 'signInWithPassword' : `signInWithIdToken ${credential.provider}`;
    const { data, error } = await call(what, () =>
      credential.kind === 'password'
        ? client.auth.signInWithPassword({ email: credential.email, password: credential.password })
        : client.auth.signInWithIdToken({ provider: credential.provider, token: credential.idToken, nonce: credential.nonce }),
    );
    if (error) {
      if (isRateLimit(error)) return 'rate_limited';
      if (error.code === 'email_not_confirmed') return 'email_not_confirmed';
      // El proveedor apagado en Supabase es un problema de configuración, no del usuario.
      if (error.code === 'provider_disabled') throw unavailable(what, error);
      return 'invalid_credentials';
    }
    const session = toSession(data.session, what);
    return { session, names: namesOf(data.user ?? data.session!.user, credential) };
  },

  async refresh(refreshToken, ip) {
    const { data, error } = await call('refreshSession', () =>
      supabaseAuthClient(ip).auth.refreshSession({ refresh_token: refreshToken }),
    );
    if (error) return isRateLimit(error) ? 'rate_limited' : 'invalid_refresh_token';
    return toSession(data.session, 'refreshSession');
  },

  async signOut(accessToken) {
    // 401/403/404: la sesión ya no existe; cerrarla de nuevo no es error.
    await call('signOut', () => supabaseAdmin().auth.admin.signOut(accessToken, 'local'));
  },

  async signUp(email, password, ip) {
    const client = supabaseAuthClient(ip);
    const { data, error } = await call('signUp', () => client.auth.signUp({ email, password }));
    if (error) {
      if (isRateLimit(error)) return 'rate_limited';
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
    const what = `deleteUser ${userId}`;
    const { error } = await call(what, () => supabaseAdmin().auth.admin.deleteUser(userId));
    // 404: ya no existe, no hay nada que deshacer.
    if (error && error.status !== 404) throw unavailable(what, error);
  },

  async sendPasswordResetCode(email, ip) {
    // Un 4xx (incluido su propio límite de envíos) no se cuenta: revelaría si el email existe.
    await call('resetPasswordForEmail', () => supabaseAuthClient(ip).auth.resetPasswordForEmail(email));
  },

  async resetPassword(email, code, newPassword, ip) {
    const client = supabaseAuthClient(ip);
    const verified = await call('verifyOtp', () => client.auth.verifyOtp({ email, token: code, type: 'recovery' }));
    if (verified.error) return isRateLimit(verified.error) ? 'rate_limited' : 'invalid_code';

    const updated = await call('updateUser', () => client.auth.updateUser({ password: newPassword })).finally(() =>
      // La sesión de recuperación no se usa más: se revoca aunque el cambio haya fallado.
      client.auth.signOut({ scope: 'local' }).catch(() => undefined),
    );
    if (updated.error) return updated.error.code === 'same_password' ? 'same_password' : 'weak_password';
    return 'ok';
  },
};
