// Contra Supabase Auth (simulado): qué se llama, en qué cliente, y cómo se traduce cada error.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthGateway } from '../application/ports';

type AuthMock = {
  resetPasswordForEmail: ReturnType<typeof vi.fn>;
  verifyOtp: ReturnType<typeof vi.fn>;
  updateUser: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  signUp: ReturnType<typeof vi.fn>;
  admin: { deleteUser: ReturnType<typeof vi.fn> };
};
const clientes = vi.hoisted(() => [] as { options: { auth?: { persistSession?: boolean } }; auth: AuthMock }[]);
const respuestas = vi.hoisted(() => ({
  reset: { data: {}, error: null } as unknown,
  verify: { data: { user: { id: 'u1' }, session: {} }, error: null } as unknown,
  update: { data: { user: { id: 'u1' } }, error: null } as unknown,
  signUp: { data: { user: { id: 'u-nuevo' }, session: null }, error: null } as unknown,
  deleteUser: { data: {}, error: null } as unknown,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((_url: string, _key: string, options: { auth?: { persistSession?: boolean } }) => {
    const auth: AuthMock = {
      resetPasswordForEmail: vi.fn(async () => respuestas.reset),
      verifyOtp: vi.fn(async () => respuestas.verify),
      updateUser: vi.fn(async () => respuestas.update),
      signOut: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => respuestas.signUp),
      admin: { deleteUser: vi.fn(async () => respuestas.deleteUser) },
    };
    clientes.push({ options, auth });
    return { auth };
  }),
}));

let gateway: AuthGateway;
const error = (status: number | undefined, code?: string) => ({ data: {}, error: { status, code, message: `error ${status}` } });

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  ({ supabaseAuthGateway: gateway } = await import('./supabaseAuthGateway'));
});

beforeEach(() => {
  clientes.length = 0;
  respuestas.reset = { data: {}, error: null };
  respuestas.verify = { data: { user: { id: 'u1' }, session: {} }, error: null };
  respuestas.update = { data: { user: { id: 'u1' } }, error: null };
  respuestas.signUp = { data: { user: { id: 'u-nuevo' }, session: null }, error: null };
  respuestas.deleteUser = { data: {}, error: null };
});

describe('sendPasswordResetCode', () => {
  it('pide el mail de recuperación en un cliente sin sesión persistente', async () => {
    await gateway.sendPasswordResetCode('ana@mail.com');
    expect(clientes).toHaveLength(1);
    expect(clientes[0]!.options.auth?.persistSession).toBe(false);
    expect(clientes[0]!.auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@mail.com');
  });

  it.each([400, 404, 422, 429])('un %i de Auth no se informa (no revela si el email existe)', async (status) => {
    respuestas.reset = error(status);
    await expect(gateway.sendPasswordResetCode('ana@mail.com')).resolves.toBeUndefined();
  });

  it.each([
    ['sin respuesta', 0],
    ['500 (p. ej. no pudo mandar el mail)', 500],
    ['respuesta rara', undefined],
  ])('Auth caído (%s) → DependencyUnavailableError', async (_caso, status) => {
    respuestas.reset = error(status as number | undefined);
    await expect(gateway.sendPasswordResetCode('ana@mail.com')).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
      dependency: 'auth',
    });
  });
});

describe('resetPassword', () => {
  it('canjea el código y cambia la contraseña en un cliente descartable, y revoca esa sesión', async () => {
    await expect(gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave')).resolves.toBe('ok');
    expect(clientes).toHaveLength(1);
    const { options, auth } = clientes[0]!;
    expect(options.auth?.persistSession).toBe(false);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'ana@mail.com', token: '123456', type: 'recovery' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'nueva-clave' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('cada reseteo usa un cliente nuevo (la sesión de uno nunca queda para otro)', async () => {
    await gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave');
    await gateway.resetPassword('beto@mail.com', '654321', 'otra-clave');
    expect(clientes).toHaveLength(2);
    expect(clientes[0]!.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(clientes[1]!.auth.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['código vencido o inválido', 403, 'invalid_code'],
    ['código mal formado', 400, 'invalid_code'],
    ['demasiadas verificaciones', 429, 'rate_limited'],
  ])('%s → %s, sin tocar la contraseña', async (_caso, status, esperado) => {
    respuestas.verify = error(status);
    await expect(gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave')).resolves.toBe(esperado);
    expect(clientes[0]!.auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ['misma contraseña', 'same_password', 'same_password'],
    ['contraseña débil', 'weak_password', 'weak_password'],
    ['otro rechazo', 'otro', 'weak_password'],
  ])('%s → %s, y la sesión de recuperación se revoca igual', async (_caso, code, esperado) => {
    respuestas.update = error(422, code);
    await expect(gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave')).resolves.toBe(esperado);
    expect(clientes[0]!.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('Auth caído al verificar o al cambiar → DependencyUnavailableError', async () => {
    respuestas.verify = error(0);
    await expect(gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave')).rejects.toMatchObject({ dependency: 'auth' });
    respuestas.verify = { data: { user: { id: 'u1' }, session: {} }, error: null };
    respuestas.update = error(503);
    await expect(gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave')).rejects.toMatchObject({ dependency: 'auth' });
  });

  it('si el cliente lanza (red), también', async () => {
    respuestas.verify = Promise.reject(new TypeError('fetch failed'));
    await expect(gateway.resetPassword('ana@mail.com', '123456', 'nueva-clave')).rejects.toMatchObject({
      name: 'DependencyUnavailableError',
    });
  });
});

describe('signUp', () => {
  it('crea el usuario en un cliente descartable, solo con email y contraseña (D-46)', async () => {
    await expect(gateway.signUp('ana@mail.com', 'clave-segura')).resolves.toEqual({ userId: 'u-nuevo' });
    expect(clientes).toHaveLength(1);
    expect(clientes[0]!.options.auth?.persistSession).toBe(false);
    expect(clientes[0]!.auth.signUp).toHaveBeenCalledWith({ email: 'ana@mail.com', password: 'clave-segura' });
    expect(clientes[0]!.auth.signOut).not.toHaveBeenCalled();
  });

  it('si Auth abre una sesión (sin confirmación de email), la revoca', async () => {
    respuestas.signUp = { data: { user: { id: 'u-nuevo' }, session: {} }, error: null };
    await gateway.signUp('ana@mail.com', 'clave-segura');
    expect(clientes[0]!.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
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
    await expect(gateway.signUp('ana@mail.com', 'clave-segura')).resolves.toBe(esperado);
  });

  it('Auth caído, red o respuesta sin usuario → DependencyUnavailableError', async () => {
    respuestas.signUp = error(500);
    await expect(gateway.signUp('ana@mail.com', 'clave-segura')).rejects.toMatchObject({ dependency: 'auth' });
    respuestas.signUp = Promise.reject(new TypeError('fetch failed'));
    await expect(gateway.signUp('ana@mail.com', 'clave-segura')).rejects.toMatchObject({ dependency: 'auth' });
    respuestas.signUp = { data: { user: null, session: null }, error: null };
    await expect(gateway.signUp('ana@mail.com', 'clave-segura')).rejects.toMatchObject({ dependency: 'auth' });
  });
});

describe('deleteUser', () => {
  const admin = () => clientes.find((c) => c.options.auth?.persistSession !== false)!.auth.admin;

  it('borra con la Admin API', async () => {
    await gateway.deleteUser('u-nuevo');
    expect(admin().deleteUser).toHaveBeenCalledWith('u-nuevo');
  });

  it('404 (ya no existe) no es error', async () => {
    respuestas.deleteUser = error(404, 'user_not_found');
    await expect(gateway.deleteUser('u-nuevo')).resolves.toBeUndefined();
  });

  it('cualquier otro error → DependencyUnavailableError con el id', async () => {
    respuestas.deleteUser = error(500);
    await expect(gateway.deleteUser('u-nuevo')).rejects.toMatchObject({ dependency: 'auth', message: expect.stringContaining('u-nuevo') });
  });
});
