// El usuario que se borra sale siempre del token, nunca de lo que mande el cliente.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { AJV_OPTIONS } from '../../../platform/http/buildApp';
import { registerErrorHandling } from '../../../platform/http/errors';
import { simularSupabaseAuth, SUPABASE_URL } from '../../../testing/supabaseAuth';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const supabaseAuth = vi.hoisted(() => ({
  getUser: vi.fn(),
  admin: { deleteUser: vi.fn() },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: supabaseAuth })),
}));
let app: FastifyInstance;

/** Token → usuario, para el `getUser` simulado. */
const TOKENS: Record<string, string> = {};
let comoA: { authorization: string };

beforeAll(async () => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const auth = await simularSupabaseAuth();
  vi.stubGlobal('fetch', auth.fetch);
  const tokenA = await auth.token(USER_A);
  const tokenB = await auth.token(USER_B);
  Object.assign(TOKENS, { [tokenA]: USER_A, [tokenB]: USER_B });
  comoA = { authorization: `Bearer ${tokenA}` };

  const { registerAccount } = await import('../index');

  app = Fastify({ ajv: AJV_OPTIONS });
  registerErrorHandling(app); // como en producción (buildApp)
  await registerAccount(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  supabaseAuth.getUser.mockImplementation(async (token: string) =>
    TOKENS[token]
      ? { data: { user: { id: TOKENS[token] } }, error: null }
      : { data: { user: null }, error: { message: 'invalid JWT' } },
  );
  supabaseAuth.admin.deleteUser.mockResolvedValue({ data: {}, error: null });
});

describe('rutas privadas — sin sesión (T-05)', () => {
  it.each([
    ['DELETE', '/users/me'],
  ] as const)('%s %s sin token → 401 sin llegar al servicio', async (method, url) => {
    const res = await app.inject({ method, url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Falta el token de sesión', code: 'UNAUTHENTICATED' });
    expect(supabaseAuth.admin.deleteUser).not.toHaveBeenCalled();
  });
});

describe('DELETE /users/me (T-05)', () => {
  it('200 { ok: true } y borra al usuario del token', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/users/me', headers: comoA });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(supabaseAuth.admin.deleteUser).toHaveBeenCalledWith(USER_A);
  });

  it('confirma la sesión con Supabase Auth antes de borrar (ADR-0008)', async () => {
    await app.inject({ method: 'DELETE', url: '/users/me', headers: comoA });
    expect(supabaseAuth.getUser).toHaveBeenCalledWith(comoA.authorization.slice('Bearer '.length));
  });

  it('sesión revocada (JWT vigente, getUser 403) → 401 y no borra nada', async () => {
    supabaseAuth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', message: 'Session from session_id claim in JWT does not exist', status: 403 },
    });
    const res = await app.inject({ method: 'DELETE', url: '/users/me', headers: comoA });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Sesión inválida o expirada', code: 'UNAUTHENTICATED' });
    expect(supabaseAuth.admin.deleteUser).not.toHaveBeenCalled();
  });

  // D-75: getUser que lanza o no responde → 503, y no se borra nada.
  it.each([
    ['getUser lanza', () => supabaseAuth.getUser.mockRejectedValue(new TypeError('fetch failed'))],
    ['Auth no responde', () => supabaseAuth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 },
    })],
  ])('%s → 503 y no borra nada', async (_caso, simular) => {
    simular();
    const res = await app.inject({ method: 'DELETE', url: '/users/me', headers: comoA });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect(supabaseAuth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('error de Supabase al borrar → 500 con mensaje', async () => {
    supabaseAuth.admin.deleteUser.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await app.inject({ method: 'DELETE', url: '/users/me', headers: comoA });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'No se pudo eliminar la cuenta', code: 'INTERNAL' });
  });
});

/* Aislamiento (RNF-S03): el usuario A nunca opera sobre los datos del B.
 * Cada caso manda el id de B por todas las vías que controla el cliente y
 * verifica que al servicio le llega el id del token de A. */
describe('aislamiento entre usuarios (T-05)', () => {
  const intentoDeB = { 'x-user-id': USER_B, 'x-userid': USER_B };

  it('DELETE /users/me: borra al dueño del token aunque se mande el id de otro', async () => {
    await app.inject({
      method: 'DELETE', url: `/users/me?userId=${USER_B}`, headers: { ...comoA, ...intentoDeB },
    });
    expect(supabaseAuth.admin.deleteUser).toHaveBeenCalledTimes(1);
    expect(supabaseAuth.admin.deleteUser).toHaveBeenCalledWith(USER_A);
  });
});

// Supabase que lanza (excepción de red): la ruta no lo atrapa, responde el manejador.
describe('DELETE /users/me — el cliente de Supabase lanza (M-07)', () => {
  it('500 INTERNAL del manejador de errores, sin el mensaje interno — CARACTERIZA: cambia en H-01 (503)', async () => {
    supabaseAuth.admin.deleteUser.mockRejectedValue(new TypeError('fetch failed'));
    const res = await app.inject({ method: 'DELETE', url: '/users/me', headers: comoA });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: 'Ocurrió un error inesperado. Intentá de nuevo en un momento.',
      code: 'INTERNAL',
    });
  });
});
