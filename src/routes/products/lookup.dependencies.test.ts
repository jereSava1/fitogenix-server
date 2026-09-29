/* T-06 · Caracterización del lookup ante fallas de dependencias
 * (docs/05-plan.md).
 *
 * A diferencia de lookup.test.ts (que simula el servicio entero), acá corre el
 * camino real ruta → productLookupService → adaptadores de catalog (Supabase y Redis), y
 * solo se simulan los clientes externos: Supabase (`createClient`) y Upstash
 * (`Redis`). Así se ve qué le llega al usuario cuando se cae cada uno.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

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
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: supabase.maybeSingle }) }) }),
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

const NO_ENCONTRADO = { error: 'Todavía no tenemos este producto en nuestro catálogo.' };
const BASE_CAIDA = { data: null, error: { message: 'TypeError: fetch failed', code: '' } };

let app: FastifyInstance;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';

  const { productLookupRoute } = await import('./lookup');
  app = Fastify();
  await app.register(productLookupRoute);
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

describe('lookup — base de datos caída (T-06)', () => {
  // CARACTERIZA: comportamiento actual, cambia en H-01. Un error de Supabase
  // se trata como "no está en el catálogo": el usuario ve 404 en vez de 503.
  it('por barcode: Supabase devuelve error → 404 "no lo tenemos"', async () => {
    supabase.maybeSingle.mockResolvedValue(BASE_CAIDA);
    const res = await lookup('7790000000024');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_ENCONTRADO);
  });

  // CARACTERIZA: comportamiento actual, cambia en H-01.
  it('por nombre: la RPC devuelve error → 404 "no lo tenemos"', async () => {
    supabase.rpc.mockResolvedValue(BASE_CAIDA);
    const res = await lookup('yogur caido');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_ENCONTRADO);
  });

  // CARACTERIZA: comportamiento actual, cambia en H-01. Si el cliente lanza en
  // vez de devolver el error, nadie lo atrapa y Fastify responde 500.
  it('por barcode: el cliente de Supabase lanza → 500', async () => {
    supabase.maybeSingle.mockRejectedValue(new Error('socket hang up'));
    const res = await lookup('7790000000031');
    expect(res.statusCode).toBe(500);
  });
});

describe('lookup — Redis caído (T-06)', () => {
  it('por barcode: Redis falla al leer y al escribir → 200 desde Supabase', async () => {
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await lookup('7790000000048');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ productId: FILA.id, name: 'Yogur natural', dataSource: 'off' });
    expect(supabase.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('por nombre: Redis falla en todas sus claves → 200 desde la RPC', async () => {
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await lookup('yogur natural redis caido');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ productId: FILA.id });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  // CARACTERIZA: comportamiento actual, cambia en H-01 (Redis con timeout de
  // 200 ms y sin reintentos). Si Redis no responde, el lookup espera sin
  // límite: la respuesta sigue pendiente mucho después de los 200 ms.
  it('por barcode: Redis colgado → la respuesta queda esperando (sin timeout)', async () => {
    let liberar: (v: null) => void = () => {};
    redis.get.mockImplementation(() => new Promise((resolve) => { liberar = resolve; }));

    const pedido = lookup('7790000000055');
    const primero = await Promise.race([
      pedido.then(() => 'respondió'),
      new Promise((resolve) => setTimeout(() => resolve('pendiente'), 300)),
    ]);
    expect(primero).toBe('pendiente');
    expect(supabase.maybeSingle).not.toHaveBeenCalled();

    liberar(null);
    const res = await pedido;
    expect(res.statusCode).toBe(200);
  });
});
