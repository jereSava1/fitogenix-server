import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_VERSION } from '../domain/product/ftgEngine';
import type { FitogenixProduct } from '../types/fitogenix';

// ── Fake de Upstash ──
// Un Map hace de servidor: alcanza para fijar el contrato de este módulo (qué
// SOBRE se escribe y qué entradas se aceptan al leer) sin red.
const store = new Map<string, unknown>();
const redisGet = vi.fn(async (key: string) => store.get(key) ?? null);
const redisSet = vi.fn(async (key: string, value: unknown) => {
  store.set(key, value);
  return 'OK';
});

vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = redisGet;
    set = redisSet;
  },
}));

// config.ts valida env vars requeridas al importarse.
function setBaseEnv() {
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  process.env.SERPAPI_API_KEY = 'test';
}

const PRODUCT_KEY = 'ftg:product:7790895000123';

// Producto mínimo con la forma NUEVA (v2.1): score nullable, sin `subscores`,
// con `breakdown.steps`.
function productoV21(overrides: Partial<FitogenixProduct> = {}): FitogenixProduct {
  return {
    name: 'Galletitas',
    dataSource: 'off',
    productId: 'uuid-galletitas',
    score: 12,
    scoreAvailable: true,
    noScore: null,
    breakdown: { engineVersion: ENGINE_VERSION, steps: [] },
    ...overrides,
  } as unknown as FitogenixProduct;
}

// Lo que dejó escrito el motor v2: `subscores`, `breakdown.components` y un
// score numérico siempre presente. Es EXACTAMENTE lo que no se puede servir.
function productoV2(): unknown {
  return {
    name: 'Galletitas',
    dataSource: 'off',
    productId: 'uuid-galletitas',
    score: 46,
    subscores: { ingredientes: 40, procesamiento: 30, nutricion: 55, aditivos: 60 },
    breakdown: { engineVersion: 'ftg-rubric-v2', components: [] },
  };
}

describe('redisService sin Redis configurado', () => {
  let redis: typeof import('./redisService');

  beforeAll(async () => {
    vi.resetModules();
    setBaseEnv();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    redis = await import('./redisService');
  });

  it('getFromRedis devuelve null (no-op)', async () => {
    await expect(redis.getFromRedis('7790001')).resolves.toBeNull();
  });

  it('setInRedis es no-op y no lanza', async () => {
    await expect(redis.setInRedis('7790001', productoV21())).resolves.toBeUndefined();
  });

  it('getSearchBarcode devuelve null (no-op)', async () => {
    await expect(redis.getSearchBarcode('coca cola')).resolves.toBeNull();
  });

  it('setSearchBarcode es no-op y no lanza', async () => {
    await expect(redis.setSearchBarcode('coca cola', '7790001')).resolves.toBeUndefined();
  });
});

describe('unwrapCachedProduct — invalidación por versión de motor', () => {
  let unwrap: typeof import('./redisService').unwrapCachedProduct;

  beforeAll(async () => {
    vi.resetModules();
    setBaseEnv();
    ({ unwrapCachedProduct: unwrap } = await import('./redisService'));
  });

  it('sobre con la versión actual → devuelve el producto', () => {
    const product = productoV21();
    expect(unwrap({ engineVersion: ENGINE_VERSION, product })).toEqual(product);
  });

  it('sobre con una versión vieja → null (miss)', () => {
    expect(unwrap({ engineVersion: 'ftg-rubric-v2', product: productoV2() })).toBeNull();
  });

  it('payload PELADO de v2 (con subscores/components) → null (miss)', () => {
    expect(unwrap(productoV2())).toBeNull();
  });

  it('payload pelado SIN breakdown → null: no hay forma de saber qué motor lo generó', () => {
    expect(unwrap({ name: 'X', productId: 'uuid', score: 40 })).toBeNull();
  });

  it('payload pelado con breakdown.engineVersion actual → se acepta (deploy rolling)', () => {
    const product = productoV21();
    expect(unwrap(product)).toEqual(product);
  });

  it('valores basura → null, no rompe', () => {
    expect(unwrap(null)).toBeNull();
    expect(unwrap('no soy un objeto')).toBeNull();
    expect(unwrap([1, 2, 3])).toBeNull();
  });
});

describe('redisService con Redis configurado — entrada vieja → miss → se repuebla', () => {
  let redis: typeof import('./redisService');

  beforeAll(async () => {
    vi.resetModules();
    setBaseEnv();
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    redis = await import('./redisService');
  });

  beforeEach(() => {
    store.clear();
    redisGet.mockClear();
    redisSet.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('setInRedis guarda un SOBRE con la ENGINE_VERSION vigente', async () => {
    const product = productoV21();
    await redis.setInRedis('7790895000123', product, 604800);

    expect(store.get(PRODUCT_KEY)).toEqual({ engineVersion: ENGINE_VERSION, product });
    expect(redisSet).toHaveBeenCalledWith(PRODUCT_KEY, expect.anything(), { ex: 604800 });
  });

  it('una entrada escrita por v2 se lee como MISS y el repoblado la pisa', async () => {
    // Estado previo al deploy: la clave tiene el payload viejo, pelado.
    store.set(PRODUCT_KEY, productoV2());
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    // 1. Lectura → miss. El cliente NUNCA ve `subscores`.
    await expect(redis.getFromRedis('7790895000123')).resolves.toBeNull();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('redis_stale_engine_version'),
    );

    // 2. La cascada repuebla (nivel Supabase → setInRedis) sobre la MISMA clave:
    //    no quedan huérfanas, que es la razón de elegir el sobre por sobre
    //    versionar la clave.
    const fresco = productoV21({ score: null, scoreAvailable: false });
    await redis.setInRedis('7790895000123', fresco);
    expect(store.size).toBe(1);

    // 3. El siguiente hit ya sirve la forma nueva, con score null incluido.
    const hit = await redis.getFromRedis('7790895000123');
    expect(hit).toEqual(fresco);
    expect(hit?.score).toBeNull();
    expect(hit).not.toHaveProperty('subscores');
  });

  it('un sobre de otra versión también es miss (bump futuro de ENGINE_VERSION)', async () => {
    store.set(PRODUCT_KEY, { engineVersion: 'ftg-rubric-v3', product: productoV21() });
    vi.spyOn(console, 'info').mockImplementation(() => {});

    await expect(redis.getFromRedis('7790895000123')).resolves.toBeNull();
  });

  it('clave inexistente → null sin loguear entrada obsoleta', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await expect(redis.getFromRedis('0000')).resolves.toBeNull();
    expect(info).not.toHaveBeenCalled();
  });

  it('el cache texto→barcode NO se versiona: query→código es dato del mundo', async () => {
    await redis.setSearchBarcode('  Coca Cola  ', '7790895000123');
    expect(store.get('ftg:search:coca cola')).toBe('7790895000123');
    await expect(redis.getSearchBarcode('COCA COLA')).resolves.toBe('7790895000123');
  });
});
