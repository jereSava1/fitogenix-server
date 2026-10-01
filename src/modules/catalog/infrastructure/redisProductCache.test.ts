import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedProduct } from '../application/ports';

// ── Fake de Upstash ──
// Un Map hace de servidor: alcanza para fijar el contrato de este módulo (qué
// se escribe y qué entradas se aceptan al leer) sin red.
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
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
}

const PRODUCT_KEY = 'ftg:product:7790895000123';

function crudo(overrides: Partial<CachedProduct> = {}): CachedProduct {
  return {
    productId: 'uuid-galletitas',
    dataSource: 'off',
    raw: { product_name: 'Galletitas', ingredients_text: 'harina, azucar' },
    ...overrides,
  };
}

// El formato anterior: la respuesta armada dentro de un sobre con la versión del motor.
function sobreViejo(): unknown {
  return {
    engineVersion: 'ftg-rubric-v2.3',
    product: { name: 'Galletitas', dataSource: 'off', productId: 'uuid-galletitas', score: 12 },
  };
}

// Y antes todavía, la respuesta pelada (motor v2).
function productoPelado(): unknown {
  return {
    name: 'Galletitas',
    dataSource: 'off',
    productId: 'uuid-galletitas',
    score: 46,
    subscores: { ingredientes: 40 },
    breakdown: { engineVersion: 'ftg-rubric-v2', components: [] },
  };
}

describe('redisService sin Redis configurado', () => {
  let redis: typeof import('./redisProductCache');

  beforeAll(async () => {
    vi.resetModules();
    setBaseEnv();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    redis = await import('./redisProductCache');
  });

  it('getFromRedis devuelve null (no-op)', async () => {
    await expect(redis.getFromRedis('7790001')).resolves.toBeNull();
  });

  it('setInRedis es no-op y no lanza', async () => {
    await expect(redis.setInRedis('7790001', crudo())).resolves.toBeUndefined();
  });

  it('getSearchBarcode devuelve null (no-op)', async () => {
    await expect(redis.getSearchBarcode('coca cola')).resolves.toBeNull();
  });

  it('setSearchBarcode es no-op y no lanza', async () => {
    await expect(redis.setSearchBarcode('coca cola', '7790001')).resolves.toBeUndefined();
  });
});

describe('parseCachedProduct — qué entradas se aceptan (K-02)', () => {
  let parse: typeof import('./redisProductCache').parseCachedProduct;

  beforeAll(async () => {
    vi.resetModules();
    setBaseEnv();
    ({ parseCachedProduct: parse } = await import('./redisProductCache'));
  });

  it('un crudo con productId y dataSource → se acepta tal cual', () => {
    expect(parse(crudo())).toEqual(crudo());
  });

  it('el sobre de antes de K-02 → null (miss), sin importar la versión del motor', () => {
    expect(parse(sobreViejo())).toBeNull();
  });

  it('la respuesta pelada del motor v2 → null (miss)', () => {
    expect(parse(productoPelado())).toBeNull();
  });

  it('sin productId (entradas pre-migración 006) o vacío → null (miss)', () => {
    const { productId: _sinId, ...sinId } = crudo();
    expect(parse(sinId)).toBeNull();
    expect(parse(crudo({ productId: '' }))).toBeNull();
  });

  it('valores basura → null, no rompe', () => {
    expect(parse(null)).toBeNull();
    expect(parse('no soy un objeto')).toBeNull();
    expect(parse([1, 2, 3])).toBeNull();
    expect(parse({ productId: 'x', dataSource: 'off', raw: 'no soy un objeto' })).toBeNull();
  });
});

describe('redisService con Redis configurado — entrada vieja → miss → se repuebla (K-02)', () => {
  let redis: typeof import('./redisProductCache');

  beforeAll(async () => {
    vi.resetModules();
    setBaseEnv();
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    redis = await import('./redisProductCache');
  });

  beforeEach(() => {
    store.clear();
    redisGet.mockClear();
    redisSet.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('setInRedis guarda el crudo, sin la respuesta armada ni la versión del motor', async () => {
    await redis.setInRedis('7790895000123', crudo(), 604800);

    expect(store.get(PRODUCT_KEY)).toEqual(crudo());
    expect(redisSet).toHaveBeenCalledWith(PRODUCT_KEY, crudo(), { ex: 604800 });
  });

  it('una entrada de antes de K-02 se lee como MISS y el repoblado la pisa en la misma clave', async () => {
    store.set(PRODUCT_KEY, sobreViejo());
    const { logger } = await import('../../../platform/logger');
    const info = vi.spyOn(logger, 'info');

    // 1. Lectura → miss, sin error; se loguea para seguir el repoblado.
    await expect(redis.getFromRedis('7790895000123')).resolves.toBeNull();
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ event: 'redis_stale_format' }), 'redis_stale_format');

    // 2. El nivel Supabase repuebla sobre la MISMA clave: no quedan huérfanas.
    await redis.setInRedis('7790895000123', crudo());
    expect(store.size).toBe(1);

    // 3. El siguiente hit ya es un crudo.
    await expect(redis.getFromRedis('7790895000123')).resolves.toEqual(crudo());
  });

  it('clave inexistente → null sin loguear entrada obsoleta', async () => {
    const { logger } = await import('../../../platform/logger');
    const info = vi.spyOn(logger, 'info');
    await expect(redis.getFromRedis('0000')).resolves.toBeNull();
    expect(info).not.toHaveBeenCalled();
  });

  it('el cache texto→barcode no cambia: query→código es dato del mundo', async () => {
    await redis.setSearchBarcode('  Coca Cola  ', '7790895000123');
    expect(store.get('ftg:search:coca cola')).toBe('7790895000123');
    await expect(redis.getSearchBarcode('COCA COLA')).resolves.toBe('7790895000123');
  });

  // H-04: la misma normalización que la búsqueda en la base (acentos y espacios).
  it('queries equivalentes con acentos o espacios de más comparten clave', async () => {
    await redis.setSearchBarcode('Café  con   LECHE', '7790001000017');
    expect(store.get('ftg:search:cafe con leche')).toBe('7790001000017');
    await expect(redis.getSearchBarcode('cafe con leche')).resolves.toBe('7790001000017');
    await expect(redis.getSearchBarcode('Cafe\tcon leche')).resolves.toBe('7790001000017');
  });
});

describe('redisProductCache — el puerto ProductCache (M-04)', () => {
  let redis: typeof import('./redisProductCache');

  beforeAll(async () => {
    vi.resetModules();
    setBaseEnv();
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    redis = await import('./redisProductCache');
  });

  beforeEach(() => {
    store.clear();
  });

  it('get / set guardan y leen el crudo (K-02: antes, un sobre versionado)', async () => {
    await redis.redisProductCache.set('7790895000123', crudo(), 604800);

    expect(store.get(PRODUCT_KEY)).toEqual(crudo());
    await expect(redis.redisProductCache.get('7790895000123')).resolves.toEqual(crudo());
  });

  it('getBarcodeForQuery / setBarcodeForQuery usan las claves ftg:search:*', async () => {
    await redis.redisProductCache.setBarcodeForQuery('  Coca Cola  ', '7790895000123');

    expect(store.get('ftg:search:coca cola')).toBe('7790895000123');
    await expect(redis.redisProductCache.getBarcodeForQuery('COCA COLA')).resolves.toBe(
      '7790895000123',
    );
  });
});
