// El camino real ruta → caso de uso → adaptadores, con Supabase y Upstash simulados:
// qué le llega al usuario cuando se cae cada uno.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { AJV_OPTIONS } from '../../../platform/http/buildApp';
import { registerErrorHandling } from '../../../platform/http/errors';

const supabase = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

const redis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      select: () => ({ retry: () => ({ eq: () => ({ maybeSingle: supabase.maybeSingle }) }) }),
    }),
    rpc: supabase.rpc,
  })),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() {
      return redis;
    }
  },
}));

const FILA = {
  id: '6f1e2c3d-0000-4000-8000-000000000001',
  barcode: '7790000000017',
  product_name: 'Yogur natural',
  category: 'Lácteos, Yogures',
  ingredients_text: 'leche parcialmente descremada, fermentos lácticos',
  nutriments: { sugars_100g: 4.7, 'energy-kcal_100g': 45 },
  data_source: 'off',
};

const NO_ENCONTRADO = {
  error: 'Todavía no tenemos este producto en nuestro catálogo.',
  code: 'PRODUCT_NOT_IN_CATALOG',
};
const NO_DISPONIBLE = {
  error: 'El servicio no está disponible en este momento. Intentá de nuevo en un rato.',
  code: 'DEPENDENCY_UNAVAILABLE',
};
const BASE_CAIDA = { data: null, error: { message: 'TypeError: fetch failed', code: '' } };

let app: FastifyInstance;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';

  const { registerCatalog } = await import('../index');
  app = Fastify({ ajv: AJV_OPTIONS });
  registerErrorHandling(app); // como en producción (buildApp)
  await registerCatalog(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  redis.get.mockResolvedValue(null);
  redis.set.mockResolvedValue('OK');
  supabase.maybeSingle.mockResolvedValue({ data: FILA, error: null });
  supabase.rpc.mockResolvedValue({ data: [FILA], error: null });
});

function lookup(query: string) {
  return app.inject({ method: 'POST', url: '/products/lookup', payload: { query } });
}

// Cambiado a propósito en H-01: una caída de la base era "no está" (404) o un 500.
describe('lookup — base de datos caída (T-06)', () => {
  function expectNoDisponible(res: Awaited<ReturnType<typeof lookup>>) {
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('10');
    expect(res.json()).toEqual(NO_DISPONIBLE);
  }

  it('por barcode: Supabase devuelve error → 503', async () => {
    supabase.maybeSingle.mockResolvedValue(BASE_CAIDA);
    expectNoDisponible(await lookup('7790000000024'));
  });

  it('por nombre: la RPC devuelve error → 503', async () => {
    supabase.rpc.mockResolvedValue(BASE_CAIDA);
    expectNoDisponible(await lookup('yogur caido'));
  });

  it('por barcode: el cliente de Supabase lanza (red, timeout) → 503', async () => {
    supabase.maybeSingle.mockRejectedValue(new Error('socket hang up'));
    expectNoDisponible(await lookup('7790000000031'));
  });

  it('no estar sigue siendo 404: la consulta salió bien y no hay fila', async () => {
    supabase.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await lookup('7790000000024');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_ENCONTRADO);
  });
});

describe('lookup — Redis caído (T-06)', () => {
  it('por barcode: Redis falla al leer y al escribir → 200 desde Supabase', async () => {
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await lookup('7790000000048');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: FILA.id, name: 'Yogur natural' });
    expect(supabase.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('por nombre: Redis falla en todas sus claves → 200 desde la RPC', async () => {
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await lookup('yogur natural redis caido');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: FILA.id });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  // Cambiado a propósito en H-01: antes esperaba sin límite.
  it('por barcode: Redis colgado → a los 200 ms sigue sin él y responde 200 desde Supabase', async () => {
    redis.get.mockImplementation(() => new Promise(() => {}));
    redis.set.mockImplementation(() => new Promise(() => {}));

    const inicio = Date.now();
    const res = await lookup('7790000000055');
    expect(res.statusCode).toBe(200);
    expect(supabase.maybeSingle).toHaveBeenCalledTimes(1);
    expect(Date.now() - inicio).toBeLessThan(1000);
  });
});

describe('lookup — formato del cache Redis (K-02)', () => {
  it('entrada de antes de K-02 (sobre con la respuesta armada) → miss, 200 desde Supabase y se repuebla con el crudo', async () => {
    redis.get.mockResolvedValue({
      engineVersion: 'ftg-rubric-v2.3',
      product: { productId: FILA.id, name: 'Yogur viejo', score: 99 },
    });

    const res = await lookup('7790000000062');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: FILA.id, name: 'Yogur natural' });
    expect(supabase.maybeSingle).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'ftg:product:7790000000062',
      { productId: FILA.id, dataSource: 'off', raw: expect.objectContaining({ product_name: 'Yogur natural' }) },
      { ex: 604800 },
    );
  });

  it('entrada cruda → 200 sin tocar Supabase, con la misma respuesta que desde Supabase', async () => {
    const desdeSupabase = await lookup('7790000000079');
    const guardado = redis.set.mock.calls[0][1];

    vi.clearAllMocks();
    redis.get.mockResolvedValue(guardado);
    const desdeRedis = await lookup('7790000000079');

    expect(desdeRedis.statusCode).toBe(200);
    expect(supabase.maybeSingle).not.toHaveBeenCalled();
    expect(desdeRedis.json()).toStrictEqual(desdeSupabase.json());
  });
});

describe('GET /products/:id (K-04)', () => {
  const detalle = (id: string) => app.inject({ method: 'GET', url: `/products/${id}` });

  it('200 con el detalle, igual al del lookup del mismo producto', async () => {
    const res = await detalle(FILA.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: FILA.id, name: 'Yogur natural', highlight: expect.any(String) });
    expect(redis.get).not.toHaveBeenCalled();
    // El nombre de reemplazo es lo único que puede cambiar (query vs barcode):
    // con nombre en la fila, el detalle y el lookup son el mismo objeto.
    expect(res.json()).toStrictEqual((await lookup(FILA.barcode)).json());
  });

  it('sin nombre en la fila, el nombre de reemplazo es su barcode (antes, el uuid)', async () => {
    supabase.maybeSingle.mockResolvedValue({ data: { ...FILA, product_name: null }, error: null });
    const res = await detalle(FILA.id);
    expect(res.json().name).toBe(FILA.barcode);
  });

  it('no existe → 404 NOT_FOUND', async () => {
    supabase.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await detalle(FILA.id);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Producto no encontrado en el catálogo', code: 'NOT_FOUND' });
  });

  it('Supabase devuelve error → 503', async () => {
    supabase.maybeSingle.mockResolvedValue(BASE_CAIDA);
    const res = await detalle(FILA.id);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual(NO_DISPONIBLE);
  });

  it('id que no es uuid → 400 sin consultar la base', async () => {
    const res = await detalle('7790000000017');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'La solicitud no es válida.', code: 'VALIDATION_ERROR' });
    expect(supabase.maybeSingle).not.toHaveBeenCalled();
  });
});
