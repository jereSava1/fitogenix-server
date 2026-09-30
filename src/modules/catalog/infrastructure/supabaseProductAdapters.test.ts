import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawProduct } from '../domain/rawProduct';

// Supabase simulado: `.select().eq().maybeSingle()` → mockRow; `.rpc(...)` → mockRpcRows.
let mockRow: Record<string, unknown> | null = null;
let mockError: unknown = null;
let mockRpcRows: Record<string, unknown>[] | null = null;
let mockRpcError: unknown = null;

const maybeSingle = vi.fn(async () => ({ data: mockRow, error: mockError }));
const eq = vi.fn(() => ({ maybeSingle }));
const retry = vi.fn();
const select = vi.fn(() => {
  const chain = { eq, retry: retry.mockImplementation(() => chain) };
  return chain;
});
const rpc = vi.fn(async () => ({ data: mockRpcRows, error: mockRpcError }));
const from = vi.fn(() => ({ select }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from, rpc })),
}));

type CacheModule = typeof import('./productRow') &
  typeof import('./supabaseProductReader') &
  typeof import('./supabaseProductWriter');
let cache: CacheModule;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  cache = {
    ...(await import('./productRow')),
    ...(await import('./supabaseProductReader')),
    ...(await import('./supabaseProductWriter')),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRow = null;
  mockError = null;
  mockRpcRows = null;
  mockRpcError = null;
});

const rawGalletitas: RawProduct = {
  product_name: 'Galletitas',
  ingredients_text: 'harina, azucar',
  nutriments: { sugars_100g: 20 },
  additives_tags: ['en:e330'],
  _aiEnriched: true,
};

// La fila completa de los 200 productos de la muestra la fija supabaseProductWriter.test.ts.
describe('buildCachePayload', () => {
  it('guarda el barcode y los crudos, sin puntaje ni columnas borradas (B-01)', () => {
    const payload = cache.buildCachePayload(rawGalletitas, '7790001');

    expect(payload.barcode).toBe('7790001');
    expect(payload.ingredients_text).toBe('harina, azucar');
    expect(payload.nutriments).toEqual({ sugars_100g: 20 });
    expect(payload.additives_tags).toEqual(['en:e330']);
    expect(payload.ai_enriched).toBe(true);
    for (const col of ['score', 'score_label', 'sello', 'engine_version', 'nova_group', 'name_key', 'manufacturer_info', 'cache_key']) {
      expect(col in payload).toBe(false);
    }
  });

  it('usa null para crudos ausentes', () => {
    const raw: RawProduct = { product_name: 'X' };

    const payload = cache.buildCachePayload(raw, '111');
    expect(payload.ingredients_text).toBeNull();
    expect(payload.nutriments).toBeNull();
    expect(payload.additives_tags).toBeNull();
  });

  it('producto de IA: data_source ai', () => {
    const payload = cache.buildCachePayload({ ingredients_text: 'dulce de leche', _aiSource: true }, '333');
    expect(payload.data_source).toBe('ai');
  });

  it('columnas denormalizadas desde el crudo: nombre limpio o de reemplazo, marca, categoría, imagen', () => {
    const payload = cache.buildCachePayload(
      { ...rawGalletitas, product_name: 'Galletitas (x3) 300 g', brands: 'Marca', categories: 'en:snacks', image_url: 'a.jpg', image_front_url: 'f.jpg' },
      '7790001',
    );
    expect(payload).toMatchObject({
      product_name: 'Galletitas',
      brand: 'Marca',
      category: 'Snacks',
      image_url: 'f.jpg',
      data_source: 'off',
    });

    const sinNada = cache.buildCachePayload({ ingredients_text: 'agua' }, '111');
    expect(sinNada).toMatchObject({ product_name: '111', brand: null, category: 'Alimento', image_url: null, ai_enriched: false });
  });
});

describe('rowToCachedRaw', () => {
  const fullRow: Record<string, unknown> = {
    id: 'uuid-galletitas',
    barcode: '7790001',
    product_name: 'Galletitas',
    brand: 'Marca',
    category: 'Snacks',
    image_url: 'http://img',
    ingredients_text: 'harina, azucar',
    nutriments: { sugars_100g: 20 },
    additives_tags: ['en:e330'],
    data_source: 'off',
    ai_enriched: true,
  };

  it('reconstruye el RawProduct y expone productId/barcode', () => {
    const result = cache.rowToCachedRaw(fullRow);
    expect(result).not.toBeNull();
    expect(result?.productId).toBe('uuid-galletitas');
    expect(result?.barcode).toBe('7790001');
    expect(result?.dataSource).toBe('off');
    expect(result?.raw).toMatchObject({
      product_name: 'Galletitas',
      brands: 'Marca',
      image_url: 'http://img',
      ingredients_text: 'harina, azucar',
      nutriments: { sugars_100g: 20 },
      additives_tags: ['en:e330'],
      categories: 'Snacks',
      _aiEnriched: true,
      _aiSource: false,
    });
  });

  it('fila sin barcode: barcode null', () => {
    const result = cache.rowToCachedRaw({
      id: 'uuid-alfajor',
      barcode: null,
      ingredients_text: 'dulce de leche',
      data_source: 'ai',
    });
    expect(result?.productId).toBe('uuid-alfajor');
    expect(result?.barcode).toBeNull();
  });

  it('fila sin id → null (sin identidad no sirve para el payload ni las FKs)', () => {
    const { id: _id, ...sinId } = fullRow;
    expect(cache.rowToCachedRaw(sinId)).toBeNull();
  });

  it('fila sin ingredients_text NI nutriments → null', () => {
    expect(
      cache.rowToCachedRaw({
        id: 'uuid-1',
        product_name: 'Galletitas',
        brand: 'Marca',
        data_source: 'off',
      }),
    ).toBeNull();
  });

  it('nutriments {} vacío cuenta como AUSENTE (sin ingredients → miss)', () => {
    // Antes {} pasaba el guard como "presente" y se servían filas sin datos.
    expect(
      cache.rowToCachedRaw({ id: 'uuid-1', product_name: 'Galletitas', nutriments: {} }),
    ).toBeNull();

    // Con ingredients_text presente, el {} no invalida la fila.
    expect(
      cache.rowToCachedRaw({ id: 'uuid-1', ingredients_text: 'harina', nutriments: {} }),
    ).not.toBeNull();
  });

  it('data_source ausente → default "off"; "ai" marca _aiSource', () => {
    const sinSource = cache.rowToCachedRaw({ id: 'uuid-1', ingredients_text: 'agua' });
    expect(sinSource?.dataSource).toBe('off');
    expect(sinSource?.raw._aiSource).toBe(false);

    const conAI = cache.rowToCachedRaw({
      id: 'uuid-1',
      ingredients_text: 'agua',
      data_source: 'ai',
    });
    expect(conAI?.dataSource).toBe('ai');
    expect(conAI?.raw._aiSource).toBe(true);
  });

  it('la lectura no cambió el mapeo: getCachedProductByBarcode ≡ rowToCachedRaw', async () => {
    mockRow = fullRow;
    const viaGet = await cache.getCachedProductByBarcode('7790001');
    expect(viaGet).toEqual(cache.rowToCachedRaw(fullRow));
  });
});

describe('getCachedProductByBarcode', () => {
  const row: Record<string, unknown> = {
    id: 'uuid-galletitas',
    barcode: '7790001',
    product_name: 'Galletitas',
    ingredients_text: 'harina, azucar',
    nutriments: { sugars_100g: 20 },
    data_source: 'off',
  };

  it('por barcode: filtra por la columna barcode y reconstruye el crudo', async () => {
    mockRow = row;

    const result = await cache.getCachedProductByBarcode('7790001');

    expect(eq).toHaveBeenCalledWith('barcode', '7790001');
    expect(result?.productId).toBe('uuid-galletitas');
    expect(result?.raw.product_name).toBe('Galletitas');
  });

  it('fila vieja sin crudos → cache miss (null)', async () => {
    mockRow = { id: 'uuid-1', barcode: '7790001', product_name: 'Galletitas' };
    await expect(cache.getCachedProductByBarcode('7790001')).resolves.toBeNull();
  });

  it('un error de Supabase es una caída, no un "no está"', async () => {
    mockError = { message: 'boom' };
    await expect(cache.getCachedProductByBarcode('7790001')).rejects.toMatchObject({ name: 'DependencyUnavailableError', dependency: 'supabase' });
  });

  it('si el cliente lanza (red, timeout), también', async () => {
    maybeSingle.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(cache.getCachedProductByBarcode('7790001')).rejects.toMatchObject({ name: 'DependencyUnavailableError', dependency: 'supabase' });
  });
});

describe('findCachedProductByName', () => {
  // Fila base con crudos válidos; cada test la ajusta con overrides.
  const makeRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'uuid-coca',
    barcode: '57045399',
    product_name: 'Coca-Cola',
    brand: 'Coca-Cola',
    ingredients_text: 'agua carbonatada, azucar',
    nutriments: { sugars_100g: 10.6 },
    data_source: 'off',
    ...overrides,
  });

  it('match simple: devuelve el crudo con productId y barcode de la fila', async () => {
    mockRpcRows = [makeRow()];

    const result = await cache.findCachedProductByName('Coca Cola');

    expect(result).not.toBeNull();
    expect(result?.productId).toBe('uuid-coca');
    expect(result?.barcode).toBe('57045399');
    expect(result?.dataSource).toBe('off');
    expect(result?.raw.product_name).toBe('Coca-Cola');
    // El ranking corre en el RPC (migración 014); acá solo verificamos que se
    // invoque con el query normalizado.
    expect(rpc).toHaveBeenCalledWith('search_products_by_name', {
      search_query: 'coca cola',
      match_limit: 5,
    });
  });

  it('normaliza el query (acentos, mayúsculas, espacios) antes de llamar al RPC', async () => {
    mockRpcRows = [makeRow()];

    await cache.findCachedProductByName('  CÓCA   Cóla  ');

    expect(rpc).toHaveBeenCalledWith('search_products_by_name', {
      search_query: 'coca cola',
      match_limit: 5,
    });
  });

  it('toma la primera fila reconstruible — el orden de relevancia lo resuelve el RPC', async () => {
    // similarity()/barcode/longitud ya vienen resueltos por el ORDER BY del
    // RPC (ver migración 014); acá solo confirmamos que se respeta ese orden
    // en vez de re-ordenar del lado del cliente.
    mockRpcRows = [
      makeRow(),
      makeRow({ id: 'uuid-ai', barcode: null, data_source: 'ai' }),
    ];

    const result = await cache.findCachedProductByName('coca cola');

    expect(result?.productId).toBe('uuid-coca');
    expect(result?.barcode).toBe('57045399');
    expect(result?.dataSource).toBe('off');
  });

  it('query normalizado < 3 caracteres → null sin consultar', async () => {
    mockRpcRows = [makeRow()];

    await expect(cache.findCachedProductByName('  a ')).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('filas sin crudos se descartan como candidatas, sigue con la próxima', async () => {
    mockRpcRows = [
      // Fila vieja sin ingredients_text ni nutriments: no sirve aunque tenga barcode.
      makeRow({ ingredients_text: null, nutriments: null }),
      makeRow({ id: 'uuid-ai', barcode: null, data_source: 'ai' }),
    ];

    const result = await cache.findCachedProductByName('coca cola');

    expect(result?.productId).toBe('uuid-ai');
    expect(result?.barcode).toBeNull();
    expect(result?.dataSource).toBe('ai');
  });

  it('sin candidatas válidas → null; error del RPC → caída', async () => {
    mockRpcRows = [makeRow({ ingredients_text: null, nutriments: null })];
    await expect(cache.findCachedProductByName('coca cola')).resolves.toBeNull();

    mockRpcRows = null;
    mockRpcError = { message: 'boom' };
    await expect(cache.findCachedProductByName('coca cola')).rejects.toMatchObject({ name: 'DependencyUnavailableError', dependency: 'supabase' });
  });
});

describe('supabaseProductReader — el puerto ProductReader (M-04)', () => {
  const row: Record<string, unknown> = {
    id: 'uuid-galletitas',
    barcode: '7790001',
    product_name: 'Galletitas',
    ingredients_text: 'harina, azucar',
    nutriments: { sugars_100g: 20 },
    data_source: 'off',
  };

  it('findByBarcode filtra por barcode y devuelve la fila reconstruida', async () => {
    mockRow = row;

    const result = await cache.supabaseProductReader.findByBarcode('7790001');

    expect(eq).toHaveBeenCalledWith('barcode', '7790001');
    expect(result).toEqual(cache.rowToCachedRaw(row));
  });

  it('findById filtra por id y devuelve la fila reconstruida (K-04)', async () => {
    mockRow = row;

    const result = await cache.supabaseProductReader.findById('uuid-galletitas');

    expect(from).toHaveBeenCalledWith('products');
    expect(select).toHaveBeenCalledWith('*');
    // Sin reintentos de postgrest-js: una caída tiene que dar 503 en ~2 s, no en ~15.
    expect(retry).toHaveBeenCalledWith(false);
    expect(eq).toHaveBeenCalledWith('id', 'uuid-galletitas');
    expect(result).toEqual(cache.rowToCachedRaw(row));
  });

  it('findByName normaliza el query y llama al RPC de búsqueda', async () => {
    mockRpcRows = [row];

    const result = await cache.supabaseProductReader.findByName('  GALLETÍTAS ');

    expect(rpc).toHaveBeenCalledWith('search_products_by_name', {
      search_query: 'galletitas',
      match_limit: 5,
    });
    expect(result?.productId).toBe('uuid-galletitas');
  });

  // H-01: antes un error de Supabase era un miss (`null`) y el usuario veía "no está".
  it('un error de Supabase es DependencyUnavailableError en los tres métodos', async () => {
    mockError = { message: 'boom' };
    mockRpcError = { message: 'boom' };

    await expect(cache.supabaseProductReader.findById('uuid-galletitas')).rejects.toMatchObject({ name: 'DependencyUnavailableError', dependency: 'supabase' });
    await expect(cache.supabaseProductReader.findByBarcode('7790001')).rejects.toMatchObject({ name: 'DependencyUnavailableError', dependency: 'supabase' });
    await expect(cache.supabaseProductReader.findByName('galletitas')).rejects.toMatchObject({ name: 'DependencyUnavailableError', dependency: 'supabase' });
  });
});
