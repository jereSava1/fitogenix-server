// Aislamiento entre usuarios: el `userId` que llega a los servicios sale siempre del
// token, nunca de lo que mande el cliente (body, query, headers).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { AJV_OPTIONS } from '../../../platform/http/buildApp';
import { registerErrorHandling } from '../../../platform/http/errors';
import type { SavedItem, SavedProducts } from '../application/saved';
import type { HistoryItem, ScanHistory } from '../application/history';
import { simularSupabaseAuth, SUPABASE_URL } from '../../../testing/supabaseAuth';

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

let comoA: { authorization: string };
let comoB: { authorization: string };
const VALIDATION = { error: 'La solicitud no es válida.', code: 'VALIDATION_ERROR' };

const RESUMEN_YOGUR = {
  id: PRODUCT_ID,
  name: 'Yogur',
  brand: null,
  imageUrl: null,
  score: 80,
  scoreLabel: 'EXCELENTE',
  scoreColor: '#16a34a',
};
const YOGUR_GUARDADO: SavedItem = { ...RESUMEN_YOGUR, savedAt: '2026-07-08T12:00:00.000Z' };
const YOGUR_ESCANEADO: HistoryItem = { ...RESUMEN_YOGUR, scannedAt: '2026-07-14T12:00:00.000Z' };

beforeAll(async () => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const auth = await simularSupabaseAuth();
  vi.stubGlobal('fetch', auth.fetch);
  comoA = { authorization: `Bearer ${await auth.token(USER_A)}` };
  comoB = { authorization: `Bearer ${await auth.token(USER_B)}` };

  const { savedRoutes } = await import('./saved.route');
  const { historyRoutes } = await import('./history.route');

  app = Fastify({ ajv: AJV_OPTIONS });
  registerErrorHandling(app); // como en producción (buildApp)
  await app.register(savedRoutes({ saved }));
  await app.register(historyRoutes({ history }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(res.json()).toEqual({ error: 'Falta el token de sesión', code: 'UNAUTHENTICATED' });
    expect(saved.listSavedProducts).not.toHaveBeenCalled();
    expect(saved.saveProduct).not.toHaveBeenCalled();
    expect(saved.removeSavedProduct).not.toHaveBeenCalled();
    expect(history.listScanHistory).not.toHaveBeenCalled();
  });

  it('token de otro sistema → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/saved', headers: { authorization: 'Bearer ajeno' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Sesión inválida o expirada', code: 'UNAUTHENTICATED' });
  });

  it('con sesión válida no se consulta a Supabase Auth: el JWT se verifica localmente (H-02)', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/saved', headers: comoA });
    expect(res.statusCode).toBe(200);
    expect(supabaseAuth.getUser).not.toHaveBeenCalled();
  });
});

describe('GET /users/me/saved (T-05)', () => {
  it('200 con { items } tal como los devuelve el servicio', async () => {
    const items = [YOGUR_GUARDADO];
    vi.mocked(saved.listSavedProducts).mockResolvedValue(items);
    const res = await app.inject({ method: 'GET', url: '/users/me/saved', headers: comoA });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items });
  });

  it('error del servicio → 500 con mensaje', async () => {
    vi.mocked(saved.listSavedProducts).mockRejectedValue(new Error('db'));
    const res = await app.inject({ method: 'GET', url: '/users/me/saved', headers: comoA });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'No se pudieron obtener los guardados', code: 'INTERNAL' });
  });
  // H-01: una caída de la base no es un 500 propio de la ruta, es un 503 del manejador.
  it.each([
    ['GET', '/users/me/saved', () => vi.mocked(saved.listSavedProducts)],
    ['POST', '/users/me/saved', () => vi.mocked(saved.saveProduct)],
    ['DELETE', `/users/me/saved/${PRODUCT_ID}`, () => vi.mocked(saved.removeSavedProduct)],
    ['GET', '/users/me/history', () => vi.mocked(history.listScanHistory)],
  ] as const)('%s %s con la base caída → 503', async (method, url, servicio) => {
    const { DependencyUnavailableError } = await import('../../../platform/dependencyError');
    servicio().mockRejectedValue(new DependencyUnavailableError('supabase', 'boom'));
    const res = await app.inject({
      method, url, headers: comoA, payload: method === 'POST' ? { productId: PRODUCT_ID } : undefined,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
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
    expect(res.json()).toEqual({ error: 'Producto no encontrado en el catálogo', code: 'NOT_FOUND' });
  });

  it.each([
    ['sin body', undefined],
    ['sin productId', {}],
    ['productId que no es uuid', { productId: '7790000000000' }],
    ['campos de más en el body (D-70)', { productId: PRODUCT_ID, nota: 'x' }],
  ])('%s → 400 sin llegar al servicio', async (_caso, payload) => {
    const res = await app.inject({ method: 'POST', url: '/users/me/saved', headers: comoA, payload });
    expect(res.statusCode).toBe(400);
    expect(saved.saveProduct).not.toHaveBeenCalled();
  });

  it('error del servicio → 500 con mensaje', async () => {
    vi.mocked(saved.saveProduct).mockRejectedValue(new Error('db'));
    const res = await app.inject({ method: 'POST', url: '/users/me/saved', headers: comoA, payload: { productId: PRODUCT_ID } });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'No se pudo guardar el producto', code: 'INTERNAL' });
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
    expect(res.json()).toEqual({ error: 'No se pudo quitar el producto guardado', code: 'INTERNAL' });
  });
});

describe('GET /users/me/history (T-05)', () => {
  it('200 con { items }; sin limit pide 20', async () => {
    const items = [YOGUR_ESCANEADO];
    vi.mocked(history.listScanHistory).mockResolvedValue(items);
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

  it('parámetros de más en la query → 400 (D-70)', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/history?limit=5&orden=asc', headers: comoA });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(VALIDATION);
    expect(history.listScanHistory).not.toHaveBeenCalled();
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
    expect(res.json()).toEqual({ error: 'No se pudo obtener el historial', code: 'INTERNAL' });
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

  // D-70: un campo de más corta la request con 400, así que no se guarda nada para nadie.
  it('POST saved: userId en el body → 400, no se guarda nada (D-70)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/users/me/saved', headers: { ...comoA, ...intentoDeB },
      payload: { productId: PRODUCT_ID, userId: USER_B, user_id: USER_B },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(VALIDATION);
    expect(saved.saveProduct).not.toHaveBeenCalled();
  });

  it('POST saved: userId en headers se ignora', async () => {
    const res = await app.inject({
      method: 'POST', url: '/users/me/saved', headers: { ...comoA, ...intentoDeB },
      payload: { productId: PRODUCT_ID },
    });
    expect(res.statusCode).toBe(200);
    expect(saved.saveProduct).toHaveBeenCalledWith(USER_A, PRODUCT_ID);
  });

  it('DELETE saved: userId en query y headers se ignora', async () => {
    await app.inject({ method: 'DELETE', url: `/users/me/saved/${PRODUCT_ID}?userId=${USER_B}`, headers: { ...comoA, ...intentoDeB } });
    expect(saved.removeSavedProduct).toHaveBeenCalledWith(USER_A, PRODUCT_ID);
  });

  // D-70: el querystring rechaza los parámetros de más.
  it('GET history: userId en query → 400, no se lista nada (D-70)', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/me/history?userId=${USER_B}`, headers: { ...comoA, ...intentoDeB } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(VALIDATION);
    expect(history.listScanHistory).not.toHaveBeenCalled();
  });

  it('GET history: userId en headers se ignora', async () => {
    await app.inject({ method: 'GET', url: '/users/me/history', headers: { ...comoA, ...intentoDeB } });
    expect(history.listScanHistory).toHaveBeenCalledWith(USER_A, 20);
  });

});
