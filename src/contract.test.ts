/* K-01 · Tests de contrato (ADR-0011).
 *
 * Se arma la app completa, como en producción (`buildApp` + `registerModules`),
 * con los SDK de Supabase y Upstash simulados, y se verifica que:
 *   1. cada respuesta de cada ruta (éxito y errores declarados) valida contra
 *      su schema de `contract/openapi.json`;
 *   2. el schema de respuesta no recorta nada: los listados devuelven los 200
 *      productos de la muestra del catálogo exactamente como los arma el
 *      código (antes de K-01 esas rutas no tenían schema y Fastify serializaba
 *      con JSON.stringify). Desde K-04, como resumen más la fecha de la fila.
 *   3. `contract/scoring-bands.json` es lo que arma el motor (K-08);
 *   4. todas las rutas están bajo `/v1`, sin alias de las viejas, y todo error
 *      —400, 401, 404, 429, 500— sale como `{ error, code }` (K-03);
 *   5. el producto tiene la forma de K-04 (detalle en el lookup y en
 *      `GET /v1/products/:id`, resumen con fecha en los listados) y los
 *      campos de más en bodies y querystrings se rechazan con 400 (D-70).
 * Que `contract/openapi.json` esté al día con los schemas lo verifica
 * `npm run contract:check` en el CI (que chequea también las bandas).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';


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

const VALIDATION = { error: 'La solicitud no es válida.', code: 'VALIDATION_ERROR' };
const INTERNAL = {
  error: 'Ocurrió un error inesperado. Intentá de nuevo en un momento.',
  code: 'INTERNAL',
};
const RUTA_INEXISTENTE = { error: 'La ruta no existe.', code: 'NOT_FOUND' };

const FILA = {
  id: PRODUCT_ID,
  barcode: '7790000000017',
  product_name: 'Yogur natural',
  category: 'Lácteos, Yogures',
  ingredients_text: 'leche parcialmente descremada, fermentos lácticos',
  nutriments: { sugars_100g: 4.7, 'energy-kcal_100g': 45 },
  data_source: 'off',
};
const GUARDADO = { product_id: PRODUCT_ID, created_at: '2026-07-08T12:00:00.123456+00:00', products: FILA };
const ESCANEO = { product_id: PRODUCT_ID, scanned_at: '2026-07-14T12:00:00+00:00', products: FILA };

/** Los 12 campos de `ProductDetail` y los 7 de `ProductSummary` (K-04). */
const CAMPOS_RESUMEN = ['id', 'name', 'brand', 'imageUrl', 'score', 'scoreLabel', 'scoreColor'];
const CAMPOS_DETALLE = [...CAMPOS_RESUMEN, 'noScore', 'fito', 'highlight', 'ingredients', 'nutrition'];

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
    saved_products: { data: [GUARDADO], error: null },
    scan_history: { data: [ESCANEO], error: null },
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
    const ok = await call('POST', '/v1/products/lookup', { payload: { query: '7790000000017' } });
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/v1/products/lookup', 'post', 200, ok.json());

    db.results.products = { data: null, error: null };
    const notFound = await call('POST', '/v1/products/lookup', { payload: { query: '7790000000024' } });
    expect(notFound.statusCode).toBe(404);
    expectMatchesContract('/v1/products/lookup', 'post', 404, notFound.json());
  });

  it('GET /products/:id → 200, 400 y 404 (K-04)', async () => {
    const ok = await call('GET', `/v1/products/${PRODUCT_ID}`);
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/v1/products/{id}', 'get', 200, ok.json());

    const noEsUuid = await call('GET', '/v1/products/7790000000017');
    expect(noEsUuid.statusCode).toBe(400);
    expect(noEsUuid.json()).toEqual(VALIDATION);
    expectMatchesContract('/v1/products/{id}', 'get', 400, noEsUuid.json());

    db.results.products = { data: null, error: null };
    const noExiste = await call('GET', `/v1/products/${PRODUCT_ID}`);
    expect(noExiste.statusCode).toBe(404);
    expect(noExiste.json()).toEqual({ error: 'Producto no encontrado en el catálogo', code: 'NOT_FOUND' });
    expectMatchesContract('/v1/products/{id}', 'get', 404, noExiste.json());
  });

  it('GET /users/me/saved → 200, 401 y 500', async () => {
    const ok = await call('GET', '/v1/users/me/saved', { auth: true });
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/v1/users/me/saved', 'get', 200, ok.json());

    const sinSesion = await call('GET', '/v1/users/me/saved');
    expect(sinSesion.statusCode).toBe(401);
    expectMatchesContract('/v1/users/me/saved', 'get', 401, sinSesion.json());

    db.results.saved_products = { data: null, error: { message: 'boom' } };
    const falla = await call('GET', '/v1/users/me/saved', { auth: true });
    expect(falla.statusCode).toBe(500);
    expectMatchesContract('/v1/users/me/saved', 'get', 500, falla.json());
  });

  it('POST /users/me/saved → 200, 404, 401 y 500', async () => {
    const payload = { productId: PRODUCT_ID };
    db.results.saved_products = { error: null };
    const ok = await call('POST', '/v1/users/me/saved', { auth: true, payload });
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/v1/users/me/saved', 'post', 200, ok.json());

    db.results.saved_products = { error: { code: '23503', message: 'violates foreign key constraint' } };
    const noExiste = await call('POST', '/v1/users/me/saved', { auth: true, payload });
    expect(noExiste.statusCode).toBe(404);
    expectMatchesContract('/v1/users/me/saved', 'post', 404, noExiste.json());

    const sinSesion = await call('POST', '/v1/users/me/saved', { payload });
    expect(sinSesion.statusCode).toBe(401);
    expectMatchesContract('/v1/users/me/saved', 'post', 401, sinSesion.json());

    db.results.saved_products = { error: { code: '42P01', message: 'boom' } };
    const falla = await call('POST', '/v1/users/me/saved', { auth: true, payload });
    expect(falla.statusCode).toBe(500);
    expectMatchesContract('/v1/users/me/saved', 'post', 500, falla.json());
  });

  it('DELETE /users/me/saved/:productId → 200, 401 y 500', async () => {
    const url = `/v1/users/me/saved/${PRODUCT_ID}`;
    db.results.saved_products = { error: null };
    const ok = await call('DELETE', url, { auth: true });
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/v1/users/me/saved/{productId}', 'delete', 200, ok.json());

    const sinSesion = await call('DELETE', url);
    expect(sinSesion.statusCode).toBe(401);
    expectMatchesContract('/v1/users/me/saved/{productId}', 'delete', 401, sinSesion.json());

    db.results.saved_products = { error: { message: 'boom' } };
    const falla = await call('DELETE', url, { auth: true });
    expect(falla.statusCode).toBe(500);
    expectMatchesContract('/v1/users/me/saved/{productId}', 'delete', 500, falla.json());
  });

  it('GET /users/me/history → 200, 401 y 500', async () => {
    const ok = await call('GET', '/v1/users/me/history', { auth: true });
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/v1/users/me/history', 'get', 200, ok.json());

    const sinSesion = await call('GET', '/v1/users/me/history');
    expect(sinSesion.statusCode).toBe(401);
    expectMatchesContract('/v1/users/me/history', 'get', 401, sinSesion.json());

    db.results.scan_history = { data: null, error: { message: 'boom' } };
    const falla = await call('GET', '/v1/users/me/history', { auth: true });
    expect(falla.statusCode).toBe(500);
    expectMatchesContract('/v1/users/me/history', 'get', 500, falla.json());
  });

  it('DELETE /users/me → 200, 401 y 500 (del handler y de una excepción)', async () => {
    const ok = await call('DELETE', '/v1/users/me', { auth: true });
    expect(ok.statusCode).toBe(200);
    expectMatchesContract('/v1/users/me', 'delete', 200, ok.json());

    const sinSesion = await call('DELETE', '/v1/users/me');
    expect(sinSesion.statusCode).toBe(401);
    expectMatchesContract('/v1/users/me', 'delete', 401, sinSesion.json());

    db.deleteUser = async () => ({ data: null, error: { message: 'boom' } });
    const errorDeSupabase = await call('DELETE', '/v1/users/me', { auth: true });
    expect(errorDeSupabase.json()).toEqual({ error: 'No se pudo eliminar la cuenta', code: 'INTERNAL' });
    expectMatchesContract('/v1/users/me', 'delete', 500, errorDeSupabase.json());

    // Hasta K-03, si el cliente lanzaba salía el 500 genérico de Fastify
    // (`{ statusCode, error, message }`); ahora el mismo formato que el resto.
    db.deleteUser = async () => {
      throw new TypeError('fetch failed');
    };
    const lanza = await call('DELETE', '/v1/users/me', { auth: true });
    expect(lanza.statusCode).toBe(500);
    expect(lanza.json()).toEqual(INTERNAL);
    expectMatchesContract('/v1/users/me', 'delete', 500, lanza.json());
  });
});

describe('contrato — /v1 y errores uniformes (K-03)', () => {
  it('todas las rutas del OpenAPI llevan /v1 y todos sus errores son ApiError', () => {
    const rutas = Object.keys(contract.paths);
    expect(rutas.length).toBeGreaterThan(0);
    for (const ruta of rutas) {
      expect(ruta.startsWith('/v1/'), ruta).toBe(true);
      for (const [method, op] of Object.entries(contract.paths[ruta]!)) {
        for (const [status, response] of Object.entries(op.responses)) {
          if (Number(status) < 400) continue;
          const schema = (response as { content: Record<string, { schema: unknown }> }).content['application/json']!.schema;
          expect(schema, `${method} ${ruta} ${status}`).toEqual({ $ref: '#/components/schemas/ApiError' });
        }
        // 429 (rate limit global) y 500 los puede responder cualquier ruta.
        expect(Object.keys(op.responses), `${method} ${ruta}`).toEqual(expect.arrayContaining(['429', '500']));
      }
    }
  });

  it('sin alias (D-57): las rutas sin /v1 responden 404 NOT_FOUND', async () => {
    for (const [method, url] of [
      ['POST', '/products/lookup'],
      ['GET', `/products/${PRODUCT_ID}`],
      ['GET', '/users/me/saved'],
      ['GET', '/users/me/history'],
      ['DELETE', '/users/me'],
    ] as const) {
      const res = await call(method, url, { auth: true, payload: method === 'POST' ? { query: 'x' } : undefined });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(res.json()).toEqual(RUTA_INEXISTENTE);
    }
  });

  it('/health sigue fuera de /v1 (D-44)', async () => {
    expect((await call('GET', '/health')).statusCode).toBe(200);
    expect((await call('GET', '/v1/health')).statusCode).toBe(404);
  });

  it('400 VALIDATION_ERROR: body, params, querystring y JSON roto, sin el detalle de ajv', async () => {
    const casos = [
      { path: '/v1/products/lookup', method: 'post', res: await call('POST', '/v1/products/lookup', { payload: { query: '' } }) },
      { path: '/v1/products/lookup', method: 'post', res: await call('POST', '/v1/products/lookup', { payload: {} }) },
      {
        path: '/v1/products/lookup',
        method: 'post',
        res: await app.inject({
          method: 'POST',
          url: '/v1/products/lookup',
          headers: { 'content-type': 'application/json' },
          payload: '{"query":',
        }),
      },
      { path: '/v1/users/me/saved', method: 'post', res: await call('POST', '/v1/users/me/saved', { auth: true, payload: { productId: 'no-es-uuid' } }) },
      { path: '/v1/users/me/saved/{productId}', method: 'delete', res: await call('DELETE', '/v1/users/me/saved/no-es-uuid', { auth: true }) },
      { path: '/v1/users/me/history', method: 'get', res: await call('GET', '/v1/users/me/history?limit=abc', { auth: true }) },
      { path: '/v1/products/{id}', method: 'get', res: await call('GET', '/v1/products/no-es-uuid') },
    ];
    for (const { path, method, res } of casos) {
      expect(res.statusCode, `${method} ${path}`).toBe(400);
      expect(res.json()).toEqual(VALIDATION);
      expectMatchesContract(path, method, 400, res.json());
    }
  });

  it('otros 4xx de Fastify (content-type no soportado) → mismo formato, con su status', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/lookup',
      headers: { 'content-type': 'application/xml' },
      payload: '<query>x</query>',
    });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toEqual(VALIDATION);
  });

  it('401 UNAUTHENTICATED: sin token y con token inválido', async () => {
    const sinToken = await call('GET', '/v1/users/me/saved');
    expect(sinToken.json()).toEqual({ error: 'Falta el token de sesión', code: 'UNAUTHENTICATED' });
    const invalido = await app.inject({ method: 'GET', url: '/v1/users/me/history', headers: { authorization: 'Bearer otro' } });
    expect(invalido.statusCode).toBe(401);
    expect(invalido.json()).toEqual({ error: 'Sesión inválida o expirada', code: 'UNAUTHENTICATED' });
    expectMatchesContract('/v1/users/me/history', 'get', 401, invalido.json());
  });

  it('404 con su código: PRODUCT_NOT_IN_CATALOG en el lookup, NOT_FOUND al guardar', async () => {
    db.results.products = { data: null, error: null };
    const lookup = await call('POST', '/v1/products/lookup', { payload: { query: '7790000000024' } });
    expect(lookup.statusCode).toBe(404);
    expect(lookup.json()).toEqual({
      error: 'Todavía no tenemos este producto en nuestro catálogo.',
      code: 'PRODUCT_NOT_IN_CATALOG',
    });

    db.results.saved_products = { error: { code: '23503', message: 'violates foreign key constraint' } };
    const guardar = await call('POST', '/v1/users/me/saved', { auth: true, payload: { productId: PRODUCT_ID } });
    expect(guardar.statusCode).toBe(404);
    expect(guardar.json()).toEqual({ error: 'Producto no encontrado en el catálogo', code: 'NOT_FOUND' });
  });

  it('500 INTERNAL cuando una excepción no la atrapa nadie, sin el mensaje interno', async () => {
    db.getUser = async () => {
      throw new Error('detalle interno que no tiene que salir');
    };
    const res = await call('GET', '/v1/users/me/saved', { auth: true });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual(INTERNAL);
    expectMatchesContract('/v1/users/me/saved', 'get', 500, res.json());
  });

  it('429 RATE_LIMITED con retry-after: la request 61 del minuto', async () => {
    // App aparte: el límite es por IP y `inject` siempre llega desde la misma.
    const { buildApp } = await import('./platform/http/buildApp');
    const { registerModules } = await import('./registerModules');
    const limitada = await buildApp();
    await registerModules(limitada);
    try {
      const pedir = () =>
        limitada.inject({ method: 'POST', url: '/v1/products/lookup', payload: { query: '7790000000017' } });
      for (let i = 0; i < 60; i++) expect((await pedir()).statusCode).toBe(200);
      const res = await pedir();
      expect(res.statusCode).toBe(429);
      expect(res.headers['retry-after']).toBe('60');
      expect(res.json()).toEqual({
        error: 'Demasiadas solicitudes. Intentá de nuevo en un momento.',
        code: 'RATE_LIMITED',
      });
      expectMatchesContract('/v1/products/lookup', 'post', 429, res.json());
    } finally {
      await limitada.close();
    }
  });
});

describe('contrato — forma del producto y campos de más (K-04, D-70)', () => {
  it('el lookup y GET /products/:id responden los 12 campos del detalle, el mismo objeto', async () => {
    const lookup = (await call('POST', '/v1/products/lookup', { payload: { query: FILA.barcode } })).json();
    const detalle = (await call('GET', `/v1/products/${PRODUCT_ID}`)).json();
    expect(Object.keys(lookup).sort()).toEqual([...CAMPOS_DETALLE].sort());
    expect(lookup.id).toBe(PRODUCT_ID);
    expect(detalle).toStrictEqual(lookup);
  });

  it('los listados responden el resumen más la fecha de la fila, en ISO', async () => {
    const saved = (await call('GET', '/v1/users/me/saved', { auth: true })).json();
    expect(Object.keys(saved.items[0]).sort()).toEqual([...CAMPOS_RESUMEN, 'savedAt'].sort());
    expect(saved.items[0]).toMatchObject({ id: PRODUCT_ID, savedAt: '2026-07-08T12:00:00.123Z' });

    const history = (await call('GET', '/v1/users/me/history', { auth: true })).json();
    expect(Object.keys(history.items[0]).sort()).toEqual([...CAMPOS_RESUMEN, 'scannedAt'].sort());
    expect(history.items[0]).toMatchObject({ id: PRODUCT_ID, scannedAt: '2026-07-14T12:00:00.000Z' });
  });

  it('GET /products/:id no registra el escaneo, aunque venga con sesión', async () => {
    // Registrar el escaneo empieza por resolver el usuario del token
    // (`onScan` → getUser): el lookup lo hace, el detalle no.
    const tokens: string[] = [];
    const getUser = db.getUser;
    db.getUser = async (token) => {
      tokens.push(token);
      return getUser(token);
    };

    await call('POST', '/v1/products/lookup', { auth: true, payload: { query: FILA.barcode } });
    await vi.waitFor(() => expect(tokens).toEqual(['token-ok']));

    const res = await call('GET', `/v1/products/${PRODUCT_ID}`, { auth: true });
    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(tokens).toEqual(['token-ok']);
  });

  it('campos de más en el body o en la query → 400 VALIDATION_ERROR (D-70)', async () => {
    const casos = [
      { path: '/v1/products/lookup', method: 'post', res: await call('POST', '/v1/products/lookup', { payload: { query: 'yogur', userId: USER } }) },
      { path: '/v1/users/me/saved', method: 'post', res: await call('POST', '/v1/users/me/saved', { auth: true, payload: { productId: PRODUCT_ID, userId: USER } }) },
      { path: '/v1/users/me/history', method: 'get', res: await call('GET', `/v1/users/me/history?limit=5&userId=${USER}`, { auth: true }) },
    ];
    for (const { path, method, res } of casos) {
      expect(res.statusCode, `${method} ${path}`).toBe(400);
      expect(res.json()).toEqual(VALIDATION);
      expectMatchesContract(path, method, 400, res.json());
    }
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
    // uuid válido por fila (el schema declara `format: 'uuid'`) y, cada tanto,
    // una sin nombre, para cubrir el nombre de reemplazo (el barcode).
    const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const AT = '2026-07-08T12:00:00+00:00';
    const filas = muestra.map((row, i) => ({
      product_id: uuid(i),
      created_at: AT,
      scanned_at: AT,
      products: {
        ...row,
        id: uuid(i),
        barcode: String(7790000000000 + i),
        ...(i % 10 === 0 ? { product_name: null } : {}),
      },
    }));
    db.results.saved_products = { data: filas, error: null };
    db.results.scan_history = { data: filas, error: null };

    const { productSummaryFromRow } = await import('./modules/catalog');
    const resumenes = filas.map(productSummaryFromRow).filter((p) => p !== null);
    expect(resumenes.length).toBeGreaterThan(50);
    expect(resumenes.some((p) => /^779\d{10}$/.test(p.name))).toBe(true);
    // Lo que respondería Fastify sin schema: JSON.stringify.
    const iso = new Date(AT).toISOString();
    const sinSchema = (campo: string) =>
      JSON.parse(JSON.stringify({ items: resumenes.map((p) => ({ ...p, [campo]: iso })) }));

    const saved = await call('GET', '/v1/users/me/saved', { auth: true });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toStrictEqual(sinSchema('savedAt'));
    expectMatchesContract('/v1/users/me/saved', 'get', 200, saved.json());

    const history = await call('GET', '/v1/users/me/history?limit=50', { auth: true });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toStrictEqual(sinSchema('scannedAt'));
    expectMatchesContract('/v1/users/me/history', 'get', 200, history.json());
  });
});
