/* T-05 · Caracterización de las rutas privadas y del aislamiento entre
 * usuarios (docs/05-plan.md) — parte de user-library (guardados e historial).
 *
 * Se registran las rutas reales con Supabase Auth simulado y los casos de uso
 * como fakes con los mismos nombres de antes (M-06). Dos usuarios, A y B, cada
 * uno con su token: el `userId` que llega a los servicios tiene que salir
 * SIEMPRE del token, nunca de lo que mande el cliente (body, query, headers).
 *
 * Hasta M-07 era un solo archivo (`src/routes/users/users.test.ts`) con
 * `DELETE /users/me`; esa parte está en account/routes/deleteMe.route.test.ts,
 * con los mismos nombres de casos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { SavedProducts } from '../application/saved';
import type { ScanHistory } from '../application/history';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const supabaseAuth = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: supabaseAuth })),
}));
const saved = {
  listSavedProducts: vi.fn<SavedProducts['listSavedProducts']>(),
  saveProduct: vi.fn<SavedProducts['saveProduct']>(),
  removeSavedProduct: vi.fn<SavedProducts['removeSavedProduct']>(),
};
const history = {
  listScanHistory: vi.fn<ScanHistory['listScanHistory']>(),
  recordScan: vi.fn<ScanHistory['recordScan']>(),
};
let app: FastifyInstance;

const TOKENS: Record<string, string> = { 'token-a': USER_A, 'token-b': USER_B };
const comoA = { authorization: 'Bearer token-a' };
const comoB = { authorization: 'Bearer token-b' };
let YOGUR: unknown;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';

  const { savedRoutes } = await import('./saved.route');
  const { historyRoutes } = await import('./history.route');
  const { mapRawToProduct } = await import('../../catalog');
  // K-01: desde que estas respuestas tienen schema, un ítem tiene que ser un
  // producto completo (antes pasaba cualquier objeto: `{ productId, name }`).
  YOGUR = {
    ...mapRawToProduct({ product_name: 'Yogur', ingredients_text: 'leche, fermentos lácticos' }, PRODUCT_ID),
    productId: PRODUCT_ID,
  };

  app = Fastify();
  await app.register(savedRoutes({ saved }));
  await app.register(historyRoutes({ history }));
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
  vi.mocked(saved.listSavedProducts).mockResolvedValue([]);
  vi.mocked(saved.saveProduct).mockResolvedValue('ok');
  vi.mocked(saved.removeSavedProduct).mockResolvedValue(undefined);
  vi.mocked(history.listScanHistory).mockResolvedValue([]);
});

describe('rutas privadas — sin sesión (T-05)', () => {
  it.each([
    ['GET', '/users/me/saved'],
    ['POST', '/users/me/saved'],
    ['DELETE', `/users/me/saved/${PRODUCT_ID}`],
    ['GET', '/users/me/history'],
  ] as const)('%s %s sin token → 401 sin llegar al servicio', async (method, url) => {
    const res = await app.inject({ method, url, payload: method === 'POST' ? { productId: PRODUCT_ID } : undefined });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Falta el token de sesión' });
    expect(saved.listSavedProducts).not.toHaveBeenCalled();
    expect(saved.saveProduct).not.toHaveBeenCalled();
    expect(saved.removeSavedProduct).not.toHaveBeenCalled();
    expect(history.listScanHistory).not.toHaveBeenCalled();
  });

  it('token de otro sistema → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/saved', headers: { authorization: 'Bearer ajeno' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Sesión inválida o expirada' });
  });
});

describe('GET /users/me/saved (T-05)', () => {
  it('200 con { items } tal como los devuelve el servicio', async () => {
    const items = [YOGUR];
    vi.mocked(saved.listSavedProducts).mockResolvedValue(items as never);
    const res = await app.inject({ method: 'GET', url: '/users/me/saved', headers: comoA });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items });
  });

  it('error del servicio → 500 con mensaje', async () => {
    vi.mocked(saved.listSavedProducts).mockRejectedValue(new Error('db'));
    const res = await app.inject({ method: 'GET', url: '/users/me/saved', headers: comoA });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'No se pudieron obtener los guardados' });
  });
});

describe('POST /users/me/saved (T-05)', () => {
  it('200 { ok: true }', async () => {
    const res = await app.inject({ method: 'POST', url: '/users/me/saved', headers: comoA, payload: { productId: PRODUCT_ID } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('producto inexistente → 404', async () => {
    vi.mocked(saved.saveProduct).mockResolvedValue('not_found');
    const res = await app.inject({ method: 'POST', url: '/users/me/saved', headers: comoA, payload: { productId: PRODUCT_ID } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Producto no encontrado en el catálogo' });
  });

  it.each([
    ['sin body', undefined],
    ['sin productId', {}],
    ['productId que no es uuid', { productId: '7790000000000' }],
  ])('%s → 400 sin llegar al servicio', async (_caso, payload) => {
    const res = await app.inject({ method: 'POST', url: '/users/me/saved', headers: comoA, payload });
    expect(res.statusCode).toBe(400);
    expect(saved.saveProduct).not.toHaveBeenCalled();
  });

  it('error del servicio → 500 con mensaje', async () => {
    vi.mocked(saved.saveProduct).mockRejectedValue(new Error('db'));
    const res = await app.inject({ method: 'POST', url: '/users/me/saved', headers: comoA, payload: { productId: PRODUCT_ID } });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'No se pudo guardar el producto' });
  });
});

describe('DELETE /users/me/saved/:productId (T-05)', () => {
  it('200 { ok: true }', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/users/me/saved/${PRODUCT_ID}`, headers: comoA });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('productId que no es uuid → 400 sin llegar al servicio', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/users/me/saved/no-es-uuid', headers: comoA });
    expect(res.statusCode).toBe(400);
    expect(saved.removeSavedProduct).not.toHaveBeenCalled();
  });

  it('error del servicio → 500 con mensaje', async () => {
    vi.mocked(saved.removeSavedProduct).mockRejectedValue(new Error('db'));
    const res = await app.inject({ method: 'DELETE', url: `/users/me/saved/${PRODUCT_ID}`, headers: comoA });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'No se pudo quitar el producto guardado' });
  });
});

describe('GET /users/me/history (T-05)', () => {
  it('200 con { items }; sin limit pide 20', async () => {
    const items = [YOGUR];
    vi.mocked(history.listScanHistory).mockResolvedValue(items as never);
    const res = await app.inject({ method: 'GET', url: '/users/me/history', headers: comoA });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items });
    expect(history.listScanHistory).toHaveBeenCalledWith(USER_A, 20);
  });

  it.each([
    ['1', 1],
    ['50', 50],
    ['0', 1],
    ['-5', 1],
    ['51', 50],
    ['999', 50],
  ])('limit=%s se ajusta a %i (no responde 400)', async (limit, esperado) => {
    const res = await app.inject({ method: 'GET', url: `/users/me/history?limit=${limit}`, headers: comoA });
    expect(res.statusCode).toBe(200);
    expect(history.listScanHistory).toHaveBeenCalledWith(USER_A, esperado);
  });

  it('limit que no es entero → 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/history?limit=abc', headers: comoA });
    expect(res.statusCode).toBe(400);
    expect(history.listScanHistory).not.toHaveBeenCalled();
  });

  it('error del servicio → 500 con mensaje', async () => {
    vi.mocked(history.listScanHistory).mockRejectedValue(new Error('db'));
    const res = await app.inject({ method: 'GET', url: '/users/me/history', headers: comoA });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'No se pudo obtener el historial' });
  });
});

/* Aislamiento (RNF-S03): el usuario A nunca opera sobre los datos del B.
 * Cada caso manda el id de B por todas las vías que controla el cliente y
 * verifica que al servicio le llega el id del token de A. */
describe('aislamiento entre usuarios (T-05)', () => {
  const intentoDeB = { 'x-user-id': USER_B, 'x-userid': USER_B };

  it('cada token lista lo suyo', async () => {
    await app.inject({ method: 'GET', url: '/users/me/saved', headers: comoA });
    await app.inject({ method: 'GET', url: '/users/me/saved', headers: comoB });
    expect(vi.mocked(saved.listSavedProducts).mock.calls).toEqual([[USER_A], [USER_B]]);
  });

  it('GET saved: userId en query y headers se ignora', async () => {
    await app.inject({ method: 'GET', url: `/users/me/saved?userId=${USER_B}&user_id=${USER_B}`, headers: { ...comoA, ...intentoDeB } });
    expect(saved.listSavedProducts).toHaveBeenCalledWith(USER_A);
  });

  it('POST saved: userId en el body se ignora', async () => {
    const res = await app.inject({
      method: 'POST', url: '/users/me/saved', headers: { ...comoA, ...intentoDeB },
      payload: { productId: PRODUCT_ID, userId: USER_B, user_id: USER_B },
    });
    expect(res.statusCode).toBe(200);
    expect(saved.saveProduct).toHaveBeenCalledWith(USER_A, PRODUCT_ID);
  });

  it('DELETE saved: userId en query y headers se ignora', async () => {
    await app.inject({ method: 'DELETE', url: `/users/me/saved/${PRODUCT_ID}?userId=${USER_B}`, headers: { ...comoA, ...intentoDeB } });
    expect(saved.removeSavedProduct).toHaveBeenCalledWith(USER_A, PRODUCT_ID);
  });

  it('GET history: userId en query y headers se ignora', async () => {
    await app.inject({ method: 'GET', url: `/users/me/history?userId=${USER_B}`, headers: { ...comoA, ...intentoDeB } });
    expect(history.listScanHistory).toHaveBeenCalledWith(USER_A, 20);
  });

});
