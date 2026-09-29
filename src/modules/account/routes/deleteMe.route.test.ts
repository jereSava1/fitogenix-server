/* T-05 · Caracterización de las rutas privadas y del aislamiento entre
 * usuarios (docs/05-plan.md) — parte de account (`DELETE /users/me`).
 *
 * Se registra el módulo con su cableado real (`registerAccount`) y Supabase
 * simulado: el usuario que se borra tiene que salir SIEMPRE del token, nunca
 * de lo que mande el cliente. Hasta M-07 estos casos estaban en
 * `src/routes/users/users.test.ts`, junto con los de user-library (ahora en
 * user-library/routes/library.routes.test.ts); conservan sus nombres.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { AJV_OPTIONS } from '../../../platform/http/buildApp';
import { registerErrorHandling } from '../../../platform/http/errors';

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

const TOKENS: Record<string, string> = { 'token-a': USER_A, 'token-b': USER_B };
const comoA = { authorization: 'Bearer token-a' };

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';

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

/* M-07 · Supabase que LANZA (excepción de red, no un `error` en la
 * respuesta). La ruta no lo atrapa: hasta K-03 salía el 500 genérico de
 * Fastify (`{ statusCode, error, message }`, con el mensaje interno); desde
 * K-03 lo arma el manejador de errores con el formato único. */
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
