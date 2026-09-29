/* K-01 · Tests de contrato (ADR-0011).
 *
 * Se arma la app completa, como en producción (`buildApp` + `registerModules`),
 * con los SDK de Supabase y Upstash simulados, y se verifica que:
 *   1. cada respuesta de cada ruta (éxito y errores declarados) valida contra
 *      su schema de `contract/openapi.json`;
 *   2. el schema de respuesta no recorta nada: los listados devuelven los 200
 *      productos de la muestra del catálogo exactamente como los arma el
 *      código (antes de K-01 esas rutas no tenían schema y Fastify serializaba
 *      con JSON.stringify).
 *   3. `contract/scoring-bands.json` es lo que arma el motor (K-08).
 * Que `contract/openapi.json` esté al día con los schemas lo verifica
 * `npm run contract:check` en el CI (que chequea también las bandas).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error: { message: string; code?: string } | null };

// ── Supabase simulado: un query builder encadenable que resuelve a lo que
// diga `db[tabla]` (o `db.rpc`). Cada test ajusta lo que necesita.
const db = vi.hoisted(() => ({
  results: {} as Record<string, unknown>,
  getUser: undefined as unknown as (token: string) => Promise<unknown>,
  deleteUser: undefined as unknown as (id: string) => Promise<unknown>,
}));

vi.mock('@supabase/supabase-js', () => {
  const builder = (table: string) => {
    const result = () => Promise.resolve(db.results[table] ?? { data: null, error: null });
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'upsert', 'delete', 'in', 'is', 'ilike']) {
      b[m] = () => b;
    }
    b.maybeSingle = result;
    b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      result().then(resolve, reject);
    return b;
  };
  return {
    createClient: () => ({
      from: builder,
      rpc: () => Promise.resolve(db.results.rpc ?? { data: [], error: null }),
      auth: {
        getUser: (token: string) => db.getUser(token),
        admin: { deleteUser: (id: string) => db.deleteUser(id) },
      },
    }),
  };
});

vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = async () => null;
    set = async () => 'OK';
  },
}));

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const comoUsuario = { authorization: 'Bearer token-ok' };

const FILA = {
  id: PRODUCT_ID,
  barcode: '7790000000017',
  product_name: 'Yogur natural',
  category: 'Lácteos, Yogures',
  ingredients_text: 'leche parcialmente descremada, fermentos lácticos',
  nutriments: { sugars_100g: 4.7, 'energy-kcal_100g': 45 },
  data_source: 'off',
};

const contract = JSON.parse(
  readFileSync(join(__dirname, '../contract/openapi.json'), 'utf8'),
) as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> };

const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true });
ajv.addSchema(contract, 'openapi');

/** Valida `body` contra el schema de `path`/`method`/`status` del OpenAPI. */
function expectMatchesContract(path: string, method: string, status: number, body: unknown) {
  const response = contract.paths[path]?.[method]?.responses[String(status)];
  expect(response, `${method.toUpperCase()} ${path} no declara ${status}`).toBeDefined();
  const pointer = ['paths', path, method, 'responses', String(status), 'content', 'application/json', 'schema']
    .map((part) => part.replace(/~/g, '~0').replace(/\//g, '~1'))
    .join('/');
  const validate = ajv.getSchema(`openapi#/${pointer}`)!;
  const ok = validate(body);
  expect(ok, JSON.stringify(validate.errors)).toBe(true);
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';

  const { buildApp } = await import('./platform/http/buildApp');
  const { registerModules } = await import('./registerModules');
  app = await buildApp();
  await registerModules(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.results = {
    products: { data: FILA, error: null },
    saved_products: { data: [{ product_id: PRODUCT_ID, products: FILA }], error: null },
    scan_history: { data: [{ product_id: PRODUCT_ID, products: FILA }], error: null },
  };
  db.getUser = async (token) =>
    token === 'token-ok'
      ? { data: { user: { id: USER } }, error: null }
      : { data: { user: null }, error: { message: 'invalid JWT' } };
  db.deleteUser = async () => ({ data: {}, error: null });
});

async function call(method: 'GET' | 'POST' | 'DELETE', url: string, opts: { auth?: boolean; payload?: unknown } = {}) {
  return app.inject({ method, url, headers: opts.auth ? comoUsuario : {}, payload: opts.payload as never });
}

describe('contrato — cada respuesta valida contra el OpenAPI (K-01)', () => {
  it('POST /products/lookup → 200 y 404', async () => {
    const ok = await call('POST', '/products/lookup', { payload: { query: '7790000000017' } });
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/products/lookup', 'post', 200, ok.json());

    db.results.products = { data: null, error: null };
    const notFound = await call('POST', '/products/lookup', { payload: { query: '7790000000024' } });
    expect(notFound.statusCode).toBe(404);
    expectMatchesContract('/products/lookup', 'post', 404, notFound.json());
  });

  it('GET /users/me/saved → 200, 401 y 500', async () => {
    const ok = await call('GET', '/users/me/saved', { auth: true });
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/users/me/saved', 'get', 200, ok.json());

    const sinSesion = await call('GET', '/users/me/saved');
    expect(sinSesion.statusCode).toBe(401);
    expectMatchesContract('/users/me/saved', 'get', 401, sinSesion.json());

    db.results.saved_products = { data: null, error: { message: 'boom' } };
    const falla = await call('GET', '/users/me/saved', { auth: true });
    expect(falla.statusCode).toBe(500);
    expectMatchesContract('/users/me/saved', 'get', 500, falla.json());
  });

  it('POST /users/me/saved → 200, 404, 401 y 500', async () => {
    const payload = { productId: PRODUCT_ID };
    db.results.saved_products = { error: null };
    const ok = await call('POST', '/users/me/saved', { auth: true, payload });
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/users/me/saved', 'post', 200, ok.json());

    db.results.saved_products = { error: { code: '23503', message: 'violates foreign key constraint' } };
    const noExiste = await call('POST', '/users/me/saved', { auth: true, payload });
    expect(noExiste.statusCode).toBe(404);
    expectMatchesContract('/users/me/saved', 'post', 404, noExiste.json());

    const sinSesion = await call('POST', '/users/me/saved', { payload });
    expect(sinSesion.statusCode).toBe(401);
    expectMatchesContract('/users/me/saved', 'post', 401, sinSesion.json());

    db.results.saved_products = { error: { code: '42P01', message: 'boom' } };
    const falla = await call('POST', '/users/me/saved', { auth: true, payload });
    expect(falla.statusCode).toBe(500);
    expectMatchesContract('/users/me/saved', 'post', 500, falla.json());
  });

  it('DELETE /users/me/saved/:productId → 200, 401 y 500', async () => {
    const url = `/users/me/saved/${PRODUCT_ID}`;
    db.results.saved_products = { error: null };
    const ok = await call('DELETE', url, { auth: true });
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/users/me/saved/{productId}', 'delete', 200, ok.json());

    const sinSesion = await call('DELETE', url);
    expect(sinSesion.statusCode).toBe(401);
    expectMatchesContract('/users/me/saved/{productId}', 'delete', 401, sinSesion.json());

    db.results.saved_products = { error: { message: 'boom' } };
    const falla = await call('DELETE', url, { auth: true });
    expect(falla.statusCode).toBe(500);
    expectMatchesContract('/users/me/saved/{productId}', 'delete', 500, falla.json());
  });

  it('GET /users/me/history → 200, 401 y 500', async () => {
    const ok = await call('GET', '/users/me/history', { auth: true });
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/users/me/history', 'get', 200, ok.json());

    const sinSesion = await call('GET', '/users/me/history');
    expect(sinSesion.statusCode).toBe(401);
    expectMatchesContract('/users/me/history', 'get', 401, sinSesion.json());

    db.results.scan_history = { data: null, error: { message: 'boom' } };
    const falla = await call('GET', '/users/me/history', { auth: true });
    expect(falla.statusCode).toBe(500);
    expectMatchesContract('/users/me/history', 'get', 500, falla.json());
  });

  it('DELETE /users/me → 200, 401 y las dos formas del 500', async () => {
    const ok = await call('DELETE', '/users/me', { auth: true });
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/users/me', 'delete', 200, ok.json());

    const sinSesion = await call('DELETE', '/users/me');
    expect(sinSesion.statusCode).toBe(401);
    expectMatchesContract('/users/me', 'delete', 401, sinSesion.json());

    db.deleteUser = async () => ({ data: null, error: { message: 'boom' } });
    const errorDeSupabase = await call('DELETE', '/users/me', { auth: true });
    expect(errorDeSupabase.json()).toEqual({ error: 'No se pudo eliminar la cuenta' });
    expectMatchesContract('/users/me', 'delete', 500, errorDeSupabase.json());

    db.deleteUser = async () => {
      throw new TypeError('fetch failed');
    };
    const lanza = await call('DELETE', '/users/me', { auth: true });
    expect(lanza.json()).toEqual({ statusCode: 500, error: 'Internal Server Error', message: 'fetch failed' });
    expectMatchesContract('/users/me', 'delete', 500, lanza.json());
  });
});

describe('contrato — bandas del puntaje (K-08, D-63)', () => {
  it('contract/scoring-bands.json es exactamente lo que arma el motor', async () => {
    const { scoringBands } = await import('./modules/scoring');
    const commiteado = JSON.parse(
      readFileSync(join(__dirname, '../contract/scoring-bands.json'), 'utf8'),
    );
    expect(commiteado).toStrictEqual(JSON.parse(JSON.stringify(scoringBands())));
  });
});

describe('contrato — el schema de los listados no recorta nada (K-01)', () => {
  it('los 200 productos de la muestra del catálogo salen igual que sin schema', async () => {
    const muestra = JSON.parse(
      readFileSync(join(__dirname, 'modules/scoring/domain/fixtures/catalog-sample.json'), 'utf8'),
    ) as Record<string, unknown>[];
    const filas = muestra.map((row, i) => ({
      product_id: `id-${i}`,
      products: { ...row, id: `id-${i}` },
    }));
    db.results.saved_products = { data: filas, error: null };
    db.results.scan_history = { data: filas, error: null };

    const { productResponseFromRow } = await import('./modules/catalog');
    const esperados = filas.map(productResponseFromRow).filter((p) => p !== null);
    expect(esperados.length).toBeGreaterThan(50);
    // Lo que respondía Fastify antes de K-01, sin schema: JSON.stringify.
    const sinSchema = JSON.parse(JSON.stringify({ items: esperados }));

    const saved = await call('GET', '/users/me/saved', { auth: true });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toStrictEqual(sinSchema);

    const history = await call('GET', '/users/me/history?limit=50', { auth: true });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toStrictEqual(sinSchema);
  });
});
