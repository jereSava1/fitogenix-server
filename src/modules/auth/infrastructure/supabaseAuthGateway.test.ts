// Contra Supabase Auth (simulado): qué se llama, en qué cliente, con qué IP, y cómo se traduce cada error.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthGateway, Credential } from '../application/ports';

type Fn = ReturnType<typeof vi.fn>;
type AuthMock = Record<'resetPasswordForEmail' | 'verifyOtp' | 'updateUser' | 'signOut' | 'signUp' | 'signInWithPassword' | 'signInWithIdToken' | 'refreshSession', Fn> & {
  admin: { deleteUser: Fn; signOut: Fn };
};
type Options = { auth?: { persistSession?: boolean }; global?: { headers?: Record<string, string> } };
const clientes = vi.hoisted(() => [] as { options: Options; auth: AuthMock }[]);
const respuestas = vi.hoisted(() => ({}) as Record<string, unknown>);
/** El admin es uno solo para todo el server: se crea una vez. */
const admin = vi.hoisted(() => ({ auth: null as AuthMock | null }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((_url: string, _key: string, options: Options) => {
    const r = (k: string) => vi.fn(async () => (typeof respuestas[k] === 'function' ? (respuestas[k] as () => unknown)() : respuestas[k]));
    const auth: AuthMock = {
      resetPasswordForEmail: r('reset'),
      verifyOtp: r('verify'),
      updateUser: r('update'),
      signOut: vi.fn(async () => ({ error: null })),
      signUp: r('signUp'),
      signInWithPassword: r('signIn'),
      signInWithIdToken: r('signIn'),
      refreshSession: r('refresh'),
      admin: { deleteUser: r('deleteUser'), signOut: r('adminSignOut') },
    };
    if (options.auth?.persistSession === false) clientes.push({ options, auth });
    else admin.auth = auth;
    return { auth };
  }),
}));

let gateway: AuthGateway;
const IP = '203.0.113.7';
const error = (status: number | undefined, code?: string) => ({ data: { user: null, session: null }, error: { status, code, message: `error ${status}` } });
const SB_SESSION = {
  access_token: 'access', refresh_token: 'refresh', expires_at: 1_900_000_000, expires_in: 3600,
  user: { id: 'u-1', email: 'ana@mail.com', user_metadata: {} },
};
const SESSION = { accessToken: 'access', refreshToken: 'refresh', expiresAt: 1_900_000_000, user: { id: 'u-1', email: 'ana@mail.com' } };
const conSesion = (user_metadata: object = {}) => {
  const session = { ...SB_SESSION, user: { ...SB_SESSION.user, user_metadata } };
  return { data: { user: session.user, session }, error: null };
};
const descartables = () => clientes;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  ({ supabaseAuthGateway: gateway } = await import('./supabaseAuthGateway'));
});

beforeEach(() => {
  clientes.length = 0;
  Object.assign(respuestas, {
    reset: { data: {}, error: null },
    verify: { data: { user: { id: 'u1' }, session: {} }, error: null },
    update: { data: { user: { id: 'u1' } }, error: null },
    signUp: { data: { user: { id: 'u-nuevo' }, session: null }, error: null },
    signIn: conSesion(),
    refresh: conSesion(),
    deleteUser: { data: {}, error: null },
    adminSignOut: { data: null, error: null },
  });
});

describe('la IP del usuario va en Sb-Forwarded-For en toda llamada con cliente descartable (D-30)', () => {
  it.each([
    ['signIn', () => gateway.signIn({ kind: 'password', email: 'a@b.co', password: 'x' }, IP)],
    ['refresh', () => gateway.refresh('refresh', IP)],
    ['signUp', () => gateway.signUp('a@b.co', 'clave-segura', IP)],
    ['sendPasswordResetCode', () => gateway.sendPasswordResetCode('a@b.co', IP)],
    ['resetPassword', () => gateway.resetPassword('a@b.co', '123456', 'nueva-clave', IP)],
  ])('%s', async (_m, run) => {
    await run();
    expect(descartables()).toHaveLength(1);
    expect(descartables()[0]!.options.global?.headers).toEqual({ 'Sb-Forwarded-For': IP });
  });
});

describe('signIn: un adaptador para todos los proveedores', () => {
  it.each<[string, Credential, 'signInWithPassword' | 'signInWithIdToken', unknown]>([
    ['email', { kind: 'password', email: 'ana@mail.com', password: 'clave' }, 'signInWithPassword', { email: 'ana@mail.com', password: 'clave' }],
    ['Google', { kind: 'id_token', provider: 'google', idToken: 'tg' }, 'signInWithIdToken', { provider: 'google', token: 'tg', nonce: undefined }],
    ['Apple', { kind: 'id_token', provider: 'apple', idToken: 'ta', nonce: 'n' }, 'signInWithIdToken', { provider: 'apple', token: 'ta', nonce: 'n' }],
  ])('%s → la llamada de Supabase que corresponde, y la sesión en el formato del contrato', async (_p, credential, metodo, args) => {
    const result = await gateway.signIn(credential, IP);
    expect(descartables()[0]!.auth[metodo]).toHaveBeenCalledWith(args);
    expect(result).toEqual({ session: SESSION, names: { firstName: null, lastName: null } });
  });

  it.each([
    ['given_name y family_name', { given_name: 'Ana', family_name: 'Pérez', full_name: 'X Y' }, { firstName: 'Ana', lastName: 'Pérez' }],
    ['full_name', { full_name: 'Ana María Pérez' }, { firstName: 'Ana', lastName: 'María Pérez' }],
    ['name', { name: 'Ana' }, { firstName: 'Ana', lastName: null }],
    ['nada', {}, { firstName: null, lastName: null }],
  ])('nombres del proveedor desde %s', async (_c, meta, names) => {
    respuestas.signIn = conSesion(meta);
    await expect(gateway.signIn({ kind: 'id_token', provider: 'google', idToken: 't' }, IP)).resolves.toMatchObject({ names });
  });

  it('los nombres que manda la app (Apple) tienen prioridad; los que faltan salen del proveedor', async () => {
    respuestas.signIn = conSesion({ full_name: 'Ana Pérez' });
    const apple: Credential = { kind: 'id_token', provider: 'apple', idToken: 't', names: { firstName: 'Anita', lastName: null } };
    await expect(gateway.signIn(apple, IP)).resolves.toMatchObject({ names: { firstName: 'Anita', lastName: 'Pérez' } });
  });

  it('sin email (Apple puede ocultarlo) → null', async () => {
    respuestas.signIn = { data: { user: { id: 'u-1', user_metadata: {} }, session: { ...SB_SESSION, user: { id: 'u-1' } } }, error: null };
    await expect(gateway.signIn({ kind: 'id_token', provider: 'apple', idToken: 't' }, IP)).resolves.toMatchObject({
      session: { user: { id: 'u-1', email: null } },
    });
  });

  it.each([
    ['credenciales inválidas', 400, 'invalid_credentials', 'invalid_credentials'],
    ['token de proveedor inválido', 400, 'bad_jwt', 'invalid_credentials'],
    ['sin confirmar', 400, 'email_not_confirmed', 'email_not_confirmed'],
    ['límite de Supabase', 429, 'over_request_rate_limit', 'rate_limited'],
  ])('%s → %s', async (_c, status, code, esperado) => {
    respuestas.signIn = error(status, code);
    await expect(gateway.signIn({ kind: 'password', email: 'a@b.co', password: 'x' }, IP)).resolves.toBe(esperado);
  });

  it.each([
    ['proveedor apagado en Supabase', error(400, 'provider_disabled')],
    ['Auth caído', error(500)],
    ['sin respuesta', error(0)],
    ['red', () => Promise.reject(new TypeError('fetch failed'))],
    ['respuesta sin sesión', { data: { user: null, session: null }, error: null }],
  ])('%s → DependencyUnavailableError', async (_c, respuesta) => {
    respuestas.signIn = respuesta;
    await expect(gateway.signIn({ kind: 'id_token', provider: 'google', idToken: 't' }, IP)).rejects.toMatchObject({
      name: 'DependencyUnavailableError', dependency: 'auth',
    });
  });
});

describe('refresh', () => {
  it('renueva en un cliente descartable', async () => {
    await expect(gateway.refresh('refresh', IP)).resolves.toEqual(SESSION);
    expect(descartables()[0]!.auth.refreshSession).toHaveBeenCalledWith({ refresh_token: 'refresh' });
  });

  it.each([
    ['refresh token usado o inexistente', 400, 'refresh_token_already_used', 'invalid_refresh_token'],
    ['sesión vencida', 400, 'session_expired', 'invalid_refresh_token'],
    ['límite', 429, undefined, 'rate_limited'],
  ])('%s → %s', async (_c, status, code, esperado) => {
    respuestas.refresh = error(status, code);
    await expect(gateway.refresh('refresh', IP)).resolves.toBe(esperado);
  });

  it('Auth caído → DependencyUnavailableError', async () => {
    respuestas.refresh = error(503);
    await expect(gateway.refresh('refresh', IP)).rejects.toMatchObject({ dependency: 'auth' });
  });
});

describe('signOut', () => {
  it('revoca solo la sesión de ese token, con la Admin API', async () => {
    await gateway.signOut('access');
    expect(admin.auth!.admin.signOut).toHaveBeenCalledWith('access', 'local');
    expect(clientes).toHaveLength(0);
  });

  it.each([401, 403, 404])('una sesión que ya no existe (%i) no es error', async (status) => {
    respuestas.adminSignOut = error(status);
    await expect(gateway.signOut('access')).resolves.toBeUndefined();
  });

  it('Auth caído → DependencyUnavailableError', async () => {
    respuestas.adminSignOut = error(500);
    await expect(gateway.signOut('access')).rejects.toMatchObject({ dependency: 'auth' });
  });
});

describe('sendPasswordResetCode', () => {
  it('pide el mail de recuperación en un cliente sin sesión persistente', async () => {
    await gateway.sendPasswordResetCode('ana@mail.com', IP);
    expect(descartables()[0]!.auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@mail.com');
  });

  it.each([400, 404, 422, 429])('un %i de Auth no se informa (no revela si el email existe)', async (status) => {
    respuestas.reset = error(status);
    await expect(gateway.sendPasswordResetCode('ana@mail.com', IP)).resolves.toBeUndefined();
  });

  it.each([
    ['sin respuesta', 0],
    ['500 (p. ej. no pudo mandar el mail)', 500],
    ['respuesta rara', undefined],
  ])('Auth caído (%s) → DependencyUnavailableError', async (_caso, status) => {
    respuestas.reset = error(status as number | undefined);
    await expect(gateway.sendPasswordResetCode('ana@mail.com', IP)).rejects.toMatchObject({
      name: 'DependencyUnavailableError', dependency: 'auth',
    });
  });
});

describe('resetPassword', () => {
  it('canjea el código y cambia la contraseña en un cliente descartable, y revoca esa sesión', async () => {
    await expect(gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave', IP)).resolves.toBe('ok');
    const { auth } = descartables()[0]!;
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'ana@mail.com', token: '123456', type: 'recovery' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'nueva-clave' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('cada reseteo usa un cliente nuevo (la sesión de uno nunca queda para otro)', async () => {
    await gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave', IP);
    await gateway.resetPassword('beto@mail.com', '654321', 'otra-clave', IP);
    expect(descartables()).toHaveLength(2);
  });

  it.each([
    ['código vencido o inválido', 403, 'invalid_code'],
    ['código mal formado', 400, 'invalid_code'],
    ['demasiadas verificaciones', 429, 'rate_limited'],
  ])('%s → %s, sin tocar la contraseña', async (_caso, status, esperado) => {
    respuestas.verify = error(status);
    await expect(gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave', IP)).resolves.toBe(esperado);
    expect(descartables()[0]!.auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ['misma contraseña', 'same_password', 'same_password'],
    ['contraseña débil', 'weak_password', 'weak_password'],
    ['otro rechazo', 'otro', 'weak_password'],
  ])('%s → %s, y la sesión de recuperación se revoca igual', async (_caso, code, esperado) => {
    respuestas.update = error(422, code);
    await expect(gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave', IP)).resolves.toBe(esperado);
    expect(descartables()[0]!.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('Auth caído al verificar o al cambiar → DependencyUnavailableError (y la sesión se revoca)', async () => {
    respuestas.verify = error(0);
    await expect(gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave', IP)).rejects.toMatchObject({ dependency: 'auth' });
    respuestas.verify = { data: { user: { id: 'u1' }, session: {} }, error: null };
    respuestas.update = error(503);
    await expect(gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave', IP)).rejects.toMatchObject({ dependency: 'auth' });
    expect(descartables()[1]!.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('si el cliente lanza (red), también', async () => {
    respuestas.verify = Promise.reject(new TypeError('fetch failed'));
    await expect(gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave', IP)).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
    });
  });
});

describe('signUp', () => {
  it('crea el usuario en un cliente descartable, solo con email y contraseña (D-46)', async () => {
    await expect(gateway.signUp('ana@mail.com', 'clave-segura', IP)).resolves.toEqual({ userId: 'u-nuevo' });
    const { auth } = descartables()[0]!;
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'ana@mail.com', password: 'clave-segura' });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('si Auth abre una sesión (sin confirmación de email), la revoca', async () => {
    respuestas.signUp = { data: { user: { id: 'u-nuevo' }, session: {} }, error: null };
    await gateway.signUp('ana@mail.com', 'clave-segura', IP);
    expect(descartables()[0]!.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it.each([
    ['email confirmado', 422, 'user_already_exists', 'email_taken'],
    ['email de otra identidad', 422, 'email_exists', 'email_taken'],
    ['contraseña débil', 422, 'weak_password', 'weak_password'],
    ['límite de mails', 429, 'over_email_send_rate_limit', 'rate_limited'],
    ['email inválido para Auth', 400, 'email_address_invalid', 'rejected'],
    ['registro deshabilitado', 422, 'signup_disabled', 'rejected'],
  ])('%s → %s', async (_caso, status, code, esperado) => {
    respuestas.signUp = error(status, code);
    await expect(gateway.signUp('ana@mail.com', 'clave-segura', IP)).resolves.toBe(esperado);
  });

  it('Auth caído, red o respuesta sin usuario → DependencyUnavailableError', async () => {
    respuestas.signUp = error(500);
    await expect(gateway.signUp('ana@mail.com', 'clave-segura', IP)).rejects.toMatchObject({ dependency: 'auth' });
    respuestas.signUp = Promise.reject(new TypeError('fetch failed'));
    await expect(gateway.signUp('ana@mail.com', 'clave-segura', IP)).rejects.toMatchObject({ dependency: 'auth' });
    respuestas.signUp = { data: { user: null, session: null }, error: null };
    await expect(gateway.signUp('ana@mail.com', 'clave-segura', IP)).rejects.toMatchObject({ dependency: 'auth' });
  });
});

describe('deleteUser', () => {
  it('borra con la Admin API', async () => {
    await gateway.deleteUser('u-nuevo');
    expect(admin.auth!.admin.deleteUser).toHaveBeenCalledWith('u-nuevo');
  });

  it('404 (ya no existe) no es error', async () => {
    respuestas.deleteUser = error(404, 'user_not_found');
    await expect(gateway.deleteUser('u-nuevo')).resolves.toBeUndefined();
  });

  it.each([400, 500])('%i → DependencyUnavailableError con el id', async (status) => {
    respuestas.deleteUser = error(status);
    await expect(gateway.deleteUser('u-nuevo')).rejects.toMatchObject({ dependency: 'auth', message: expect.stringContaining('u-nuevo') });
  });
});
