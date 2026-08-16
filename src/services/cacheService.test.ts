import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FitogenixProduct, RawOFFProduct } from '../types/fitogenix';

// ── Mock de Supabase ──
// createClient devuelve un cliente cuyo query builder resuelve a lo que dejemos
// en las variables de resultado. Cadenas cubiertas:
//   .select('*').eq().maybeSingle()                  → mockRow (getCachedProductBy*)
//   .select('*').ilike().order().limit()             → mockRows (findCachedProductByName)
//   .select('id, product_name').is().ilike().limit() → upgradeRows (upgrade name→barcode)
//   .upsert().select('id').single()                  → upsertResult (setCachedProduct)
//   .update().eq().select('id').single()             → updateResult (upgrade update)
let mockRow: Record<string, unknown> | null = null;
let mockError: unknown = null;
let mockRows: Record<string, unknown>[] | null = null;
let mockRowsError: unknown = null;
let upgradeRows: Record<string, unknown>[] | null = [];
let upgradeError: unknown = null;
type SingleResult = { data: Record<string, unknown> | null; error: { message: string } | null };
let upsertResult: SingleResult = { data: null, error: null };
let updateResult: SingleResult = { data: null, error: null };

const maybeSingle = vi.fn(async () => ({ data: mockRow, error: mockError }));
const eq = vi.fn(() => ({ maybeSingle }));
const orderLimit = vi.fn(async () => ({ data: mockRows, error: mockRowsError }));
const order = vi.fn(() => ({ limit: orderLimit }));
const ilike = vi.fn(() => ({ order }));
const isLimit = vi.fn(async () => ({ data: upgradeRows, error: upgradeError }));
const isIlike = vi.fn(() => ({ limit: isLimit }));
const isFn = vi.fn(() => ({ ilike: isIlike }));
const select = vi.fn(() => ({ eq, ilike, is: isFn }));
const upsertSingle = vi.fn(async () => upsertResult);
const upsertSelect = vi.fn(() => ({ single: upsertSingle }));
const upsert = vi.fn(() => ({ select: upsertSelect }));
const updateSingle = vi.fn(async () => updateResult);
const updateSelect = vi.fn(() => ({ single: updateSingle }));
const updateEq = vi.fn(() => ({ select: updateSelect }));
const update = vi.fn((_payload: Record<string, unknown>) => ({ eq: updateEq }));
const from = vi.fn(() => ({ select, upsert, update }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from })),
}));

type CacheModule = typeof import('./cacheService');
let cache: CacheModule;
let ENGINE_VERSION: string;

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  process.env.SERPAPI_API_KEY = 'test';
  cache = await import('./cacheService');
  ({ ENGINE_VERSION } = await import('../domain/product/ftgEngine'));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRow = null;
  mockError = null;
  mockRows = null;
  mockRowsError = null;
  upgradeRows = [];
  upgradeError = null;
  upsertResult = { data: null, error: null };
  updateResult = { data: null, error: null };
});

// Producto mínimo para payloads/persistencia.
const makeProduct = (overrides: Record<string, unknown> = {}): FitogenixProduct =>
  ({
    name: 'Galletitas',
    brand: 'Marca',
    category: 'Snacks',
    imageUrl: 'http://img',
    score: 42,
    dataSource: 'off',
    aiEnriched: true,
    ...overrides,
  }) as unknown as FitogenixProduct;

const rawGalletitas: RawOFFProduct = {
  product_name: 'Galletitas',
  ingredients_text: 'harina, azucar',
  nutriments: { sugars_100g: 20 },
  nova_group: 4,
  additives_tags: ['en:e330'],
  _aiEnriched: true,
};

describe('buildCachePayload', () => {
  it('con barcode: guarda los crudos, engine_version y SOLO la columna barcode', () => {
    const payload = cache.buildCachePayload(makeProduct(), rawGalletitas, {
      barcode: '7790001',
    });

    expect(payload.barcode).toBe('7790001');
    // La otra columna de búsqueda se OMITE (para no pisar un alias existente)
    // y cache_key ya no existe en el esquema.
    expect('name_key' in payload).toBe(false);
    expect('cache_key' in payload).toBe(false);
    expect(payload.ingredients_text).toBe('harina, azucar');
    expect(payload.nutriments).toEqual({ sugars_100g: 20 });
    expect(payload.nova_group).toBe(4);
    expect(payload.additives_tags).toEqual(['en:e330']);
    expect(payload.engine_version).toBe(ENGINE_VERSION);
    expect(payload.ai_enriched).toBe(true);
  });

  it('usa null para crudos ausentes', () => {
    const raw: RawOFFProduct = { product_name: 'X' };
    const product = makeProduct({
      name: 'X',
      brand: '',
      category: '',
      imageUrl: null,
      score: 50,
      aiEnriched: undefined,
    });

    const payload = cache.buildCachePayload(product, raw, { barcode: '111' });
    expect(payload.ingredients_text).toBeNull();
    expect(payload.nutriments).toBeNull();
    expect(payload.nova_group).toBeNull();
    expect(payload.additives_tags).toBeNull();
  });

  it('score null se persiste como null, con su label y sin sello', () => {
    // v2.1: el motor no puntúa lo que cae en §1 (fuera de alcance, sin datos,
    // lista no identificable). Ese null tiene que llegar a la DB COMO null —
    // si se coercionara a 0, la fila quedaría indistinguible del peor producto
    // del catálogo y los listados de guardados/historial mentirían.
    const product = makeProduct({ score: null });

    const payload = cache.buildCachePayload(product, rawGalletitas, { barcode: '222' });

    expect(payload.score).toBeNull();
    expect(payload.score_label).toBe('SIN DATOS SUFICIENTES');
    expect(payload.sello).toBeNull();
  });

  it('producto solo-IA: name_key SIN prefijo y sin columna barcode', () => {
    const raw: RawOFFProduct = {
      product_name: 'Alfajor Artesanal',
      ingredients_text: 'dulce de leche',
    };
    const product = makeProduct({
      name: 'Alfajor Artesanal',
      brand: '',
      category: '',
      imageUrl: null,
      score: 30,
      dataSource: 'ai',
    });

    const payload = cache.buildCachePayload(product, raw, { nameKey: 'alfajor artesanal' });
    // name_key es el QUERY normalizado sin el prefijo 'name:' (ese prefijo es
    // solo de las claves internas de Redis/logs, no va a la DB).
    expect(payload.name_key).toBe('alfajor artesanal');
    expect('barcode' in payload).toBe(false);
    expect('cache_key' in payload).toBe(false);
    expect(payload.ai_enriched).toBe(true);
  });
});

describe('rowToCachedRaw', () => {
  const fullRow: Record<string, unknown> = {
    id: 'uuid-galletitas',
    barcode: '7790001',
    name_key: null,
    product_name: 'Galletitas',
    brand: 'Marca',
    category: 'Snacks',
    image_url: 'http://img',
    ingredients_text: 'harina, azucar',
    nutriments: { sugars_100g: 20 },
    nova_group: 4,
    additives_tags: ['en:e330'],
    data_source: 'off',
    ai_enriched: true,
  };

  it('reconstruye el RawOFFProduct y expone productId/barcode/nameKey', () => {
    const result = cache.rowToCachedRaw(fullRow);
    expect(result).not.toBeNull();
    expect(result?.productId).toBe('uuid-galletitas');
    expect(result?.barcode).toBe('7790001');
    expect(result?.nameKey).toBeNull();
    expect(result?.dataSource).toBe('off');
    expect(result?.raw).toMatchObject({
      product_name: 'Galletitas',
      brands: 'Marca',
      image_url: 'http://img',
      ingredients_text: 'harina, azucar',
      nutriments: { sugars_100g: 20 },
      nova_group: 4,
      additives_tags: ['en:e330'],
      categories: 'Snacks',
      _aiEnriched: true,
      _aiSource: false,
    });
  });

  it('expone nameKey en filas solo-IA (barcode null)', () => {
    const result = cache.rowToCachedRaw({
      id: 'uuid-alfajor',
      barcode: null,
      name_key: 'alfajor artesanal',
      ingredients_text: 'dulce de leche',
      data_source: 'ai',
    });
    expect(result?.productId).toBe('uuid-alfajor');
    expect(result?.barcode).toBeNull();
    expect(result?.nameKey).toBe('alfajor artesanal');
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

describe('getCachedProductByBarcode / getCachedProductByNameKey', () => {
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

  it('por nameKey: filtra por la columna name_key (query normalizado SIN prefijo)', async () => {
    mockRow = {
      ...row,
      id: 'uuid-alfajor',
      barcode: null,
      name_key: 'alfajor artesanal',
      data_source: 'ai',
    };

    const result = await cache.getCachedProductByNameKey('alfajor artesanal');

    expect(eq).toHaveBeenCalledWith('name_key', 'alfajor artesanal');
    expect(result?.productId).toBe('uuid-alfajor');
    expect(result?.nameKey).toBe('alfajor artesanal');
    expect(result?.barcode).toBeNull();
  });

  it('fila vieja sin crudos → cache miss (null)', async () => {
    mockRow = { id: 'uuid-1', barcode: '7790001', product_name: 'Galletitas' };
    await expect(cache.getCachedProductByBarcode('7790001')).resolves.toBeNull();
  });

  it('devuelve null cuando Supabase da error', async () => {
    mockError = { message: 'boom' };
    await expect(cache.getCachedProductByBarcode('7790001')).resolves.toBeNull();
    await expect(cache.getCachedProductByNameKey('alfajor')).resolves.toBeNull();
  });
});

describe('findCachedProductByName', () => {
  // Fila base con crudos válidos; cada test la ajusta con overrides.
  const makeRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'uuid-coca',
    barcode: '57045399',
    name_key: null,
    product_name: 'Coca-Cola',
    brand: 'Coca-Cola',
    ingredients_text: 'agua carbonatada, azucar',
    nutriments: { sugars_100g: 10.6 },
    data_source: 'off',
    ...overrides,
  });

  it('match simple: devuelve el crudo con productId y barcode de la fila', async () => {
    mockRows = [makeRow()];

    const result = await cache.findCachedProductByName('Coca Cola');

    expect(result).not.toBeNull();
    expect(result?.productId).toBe('uuid-coca');
    expect(result?.barcode).toBe('57045399');
    expect(result?.dataSource).toBe('off');
    expect(result?.raw.product_name).toBe('Coca-Cola');
    // El patrón intercala los tokens normalizados con %.
    expect(ilike).toHaveBeenCalledWith('product_name', '%coca%cola%');
  });

  it('normaliza el query (acentos, mayúsculas, espacios) antes de armar el patrón', async () => {
    mockRows = [makeRow()];

    await cache.findCachedProductByName('  CÓCA   Cóla  ');

    expect(ilike).toHaveBeenCalledWith('product_name', '%coca%cola%');
  });

  it('prefiere la fila con barcode (datos reales) sobre la fila solo-IA', async () => {
    mockRows = [
      // La fila IA viene primera (updated_at más reciente) pero pierde igual.
      makeRow({ id: 'uuid-ai', barcode: null, name_key: 'coca cola', data_source: 'ai' }),
      makeRow(),
    ];

    const result = await cache.findCachedProductByName('coca cola');

    expect(result?.productId).toBe('uuid-coca');
    expect(result?.barcode).toBe('57045399');
    expect(result?.dataSource).toBe('off');
  });

  it('entre filas con barcode prefiere el nombre más corto (match más ajustado)', async () => {
    mockRows = [
      makeRow({
        id: 'uuid-zero',
        barcode: '111',
        product_name: 'Coca-Cola Zero Sin Azucar 2.25L',
      }),
      makeRow({ id: 'uuid-comun', barcode: '222', product_name: 'Coca-Cola' }),
    ];

    const result = await cache.findCachedProductByName('coca cola');

    expect(result?.productId).toBe('uuid-comun');
  });

  it('query normalizado < 3 caracteres → null sin consultar', async () => {
    mockRows = [makeRow()];

    await expect(cache.findCachedProductByName('  a ')).resolves.toBeNull();
    expect(ilike).not.toHaveBeenCalled();
  });

  it('escapa %, _ y \\ en los tokens del patrón', async () => {
    mockRows = null;

    await cache.findCachedProductByName('jugo 100% na_ranja');

    expect(ilike).toHaveBeenCalledWith('product_name', '%jugo%100\\%%na\\_ranja%');
  });

  it('filas sin crudos se descartan como candidatas', async () => {
    mockRows = [
      // Fila vieja sin ingredients_text ni nutriments: no sirve aunque tenga barcode.
      makeRow({ ingredients_text: null, nutriments: null }),
      makeRow({ id: 'uuid-ai', barcode: null, name_key: 'coca cola', data_source: 'ai' }),
    ];

    const result = await cache.findCachedProductByName('coca cola');

    expect(result?.productId).toBe('uuid-ai');
    expect(result?.barcode).toBeNull();
    expect(result?.nameKey).toBe('coca cola');
    expect(result?.dataSource).toBe('ai');
  });

  it('sin candidatas válidas (o error de Supabase) → null', async () => {
    mockRows = [makeRow({ ingredients_text: null, nutriments: null })];
    await expect(cache.findCachedProductByName('coca cola')).resolves.toBeNull();

    mockRows = null;
    mockRowsError = { message: 'boom' };
    await expect(cache.findCachedProductByName('coca cola')).resolves.toBeNull();
  });
});

describe('setCachedProduct', () => {
  it('upsert por barcode: onConflict barcode, awaiteado, devuelve el id de la fila', async () => {
    upsertResult = { data: { id: 'uuid-nuevo' }, error: null };

    const id = await cache.setCachedProduct(makeProduct(), rawGalletitas, {
      barcode: '7790001',
    });

    expect(id).toBe('uuid-nuevo');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ barcode: '7790001', product_name: 'Galletitas' }),
      { onConflict: 'barcode' },
    );
    expect(upsertSelect).toHaveBeenCalledWith('id');
    // Con barcode SIEMPRE se intenta primero el upgrade name→barcode.
    expect(isFn).toHaveBeenCalledWith('barcode', null);
    // Sin fila upgradeable no hay update.
    expect(update).not.toHaveBeenCalled();
  });

  it('upsert por nameKey: onConflict name_key y SIN lookup de upgrade', async () => {
    upsertResult = { data: { id: 'uuid-alfajor' }, error: null };

    const id = await cache.setCachedProduct(
      makeProduct({ name: 'Alfajor Artesanal', dataSource: 'ai' }),
      rawGalletitas,
      { nameKey: 'alfajor artesanal' },
    );

    expect(id).toBe('uuid-alfajor');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ name_key: 'alfajor artesanal' }),
      { onConflict: 'name_key' },
    );
    // El upgrade aplica solo al camino con barcode.
    expect(isFn).not.toHaveBeenCalled();
  });

  it('upgrade name→barcode: UPDATE de la fila existente, id conservado, sin duplicar', async () => {
    // Fila vieja solo-IA (barcode null) con el mismo nombre normalizado.
    upgradeRows = [{ id: 'uuid-viejo', product_name: 'galletitas' }];
    updateResult = { data: { id: 'uuid-viejo' }, error: null };

    const id = await cache.setCachedProduct(
      makeProduct({ name: 'Galletitas' }),
      rawGalletitas,
      { barcode: '7790001' },
    );

    // Devuelve el id de la fila EXISTENTE (los guardados sobreviven).
    expect(id).toBe('uuid-viejo');
    expect(updateEq).toHaveBeenCalledWith('id', 'uuid-viejo');
    // El update setea el barcode pero NO trae name_key → el alias se conserva.
    const updatePayload = update.mock.calls[0][0];
    expect(updatePayload.barcode).toBe('7790001');
    expect('name_key' in updatePayload).toBe(false);
    // No se creó otra fila.
    expect(upsert).not.toHaveBeenCalled();
  });

  it('upgrade matchea por nombre NORMALIZADO (acentos, mayúsculas, espacios)', async () => {
    upgradeRows = [{ id: 'uuid-viejo', product_name: '  Galletítas   Dulces ' }];
    updateResult = { data: { id: 'uuid-viejo' }, error: null };

    const id = await cache.setCachedProduct(
      makeProduct({ name: 'galletitas dulces' }),
      rawGalletitas,
      { barcode: '7790001' },
    );

    expect(id).toBe('uuid-viejo');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('upgrade exige igualdad EXACTA del nombre normalizado: si difiere, upsert normal', async () => {
    // El prefiltro ILIKE la trae como candidata, pero no es el mismo producto.
    upgradeRows = [{ id: 'uuid-otro', product_name: 'Galletitas Chocolate' }];
    upsertResult = { data: { id: 'uuid-nuevo' }, error: null };

    const id = await cache.setCachedProduct(
      makeProduct({ name: 'Galletitas' }),
      rawGalletitas,
      { barcode: '7790001' },
    );

    expect(id).toBe('uuid-nuevo');
    expect(update).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
  });

  it('error de upsert → null y se loguea (el lookup responde igual, sin productId)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    upsertResult = { data: null, error: { message: 'boom' } };

    const id = await cache.setCachedProduct(makeProduct(), rawGalletitas, {
      barcode: '7790001',
    });

    expect(id).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('si el update del upgrade falla, cae al upsert como último recurso', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    upgradeRows = [{ id: 'uuid-viejo', product_name: 'Galletitas' }];
    updateResult = { data: null, error: { message: 'boom' } };
    upsertResult = { data: { id: 'uuid-nuevo' }, error: null };

    const id = await cache.setCachedProduct(
      makeProduct({ name: 'Galletitas' }),
      rawGalletitas,
      { barcode: '7790001' },
    );

    expect(id).toBe('uuid-nuevo');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
