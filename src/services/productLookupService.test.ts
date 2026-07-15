import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedProductRow } from './cacheService';
import type { FitogenixProduct, RawOFFProduct } from '../types/fitogenix';

// ── Mocks de los módulos de servicios ──
vi.mock('./cacheService', () => ({
  getCachedProductByBarcode: vi.fn(async () => null),
  getCachedProductByNameKey: vi.fn(async () => null),
  // Awaiteado en el cold path: devuelve el id (uuid) de la fila upserteada.
  setCachedProduct: vi.fn(async () => 'uuid-nuevo'),
  findCachedProductByName: vi.fn(async () => null),
}));
vi.mock('./redisService', () => ({
  getFromRedis: vi.fn(async () => null),
  setInRedis: vi.fn(async () => undefined),
  getSearchBarcode: vi.fn(async () => null),
  setSearchBarcode: vi.fn(async () => undefined),
}));
vi.mock('./offService', () => ({
  OffServiceUnavailableError: class OffServiceUnavailableError extends Error {},
  fetchProductByBarcode: vi.fn(async () => null),
  completeResolvedMatch: vi.fn(async () => ({}) as RawOFFProduct),
  resolveQueryToCode: vi.fn(async () => null),
}));
vi.mock('./claudeService', () => ({
  enrichWithAI: vi.fn(async (off: RawOFFProduct) => off),
  aiLookupProduct: vi.fn(async () => null),
}));
vi.mock('./imageService', () => ({
  fetchRetailerImage: vi.fn(async () => null),
  fetchSearchImageUrl: vi.fn(async () => null),
}));
vi.mock('./openBeautyFactsApi', () => ({
  fetchBeautyProductByBarcode: vi.fn(async () => null),
}));
vi.mock('./fallbackFoodApi', () => ({
  fetchEdamamByBarcode: vi.fn(async () => null),
}));

type LookupModule = typeof import('./productLookupService');
let lookupProduct: LookupModule['lookupProduct'];
let cacheService: typeof import('./cacheService');
let redisService: typeof import('./redisService');
let offService: typeof import('./offService');
let claudeService: typeof import('./claudeService');
let obfService: typeof import('./openBeautyFactsApi');
let edamamService: typeof import('./fallbackFoodApi');

const rawProduct: RawOFFProduct = {
  product_name: 'Galletitas',
  brands: 'Marca',
  ingredients_text: 'harina, azucar',
  nutriments: { sugars_100g: 20 },
  nova_group: 4,
};

// Hit de cache/catálogo con la forma nueva (identidad + atributos de búsqueda).
const cachedHit = (overrides: Partial<CachedProductRow> = {}): CachedProductRow => ({
  raw: rawProduct,
  dataSource: 'off',
  productId: 'uuid-galletitas',
  barcode: '7790895000123',
  nameKey: null,
  ...overrides,
});

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  process.env.SERPAPI_API_KEY = 'test';
  ({ lookupProduct } = await import('./productLookupService'));
  cacheService = await import('./cacheService');
  redisService = await import('./redisService');
  offService = await import('./offService');
  claudeService = await import('./claudeService');
  obfService = await import('./openBeautyFactsApi');
  edamamService = await import('./fallbackFoodApi');
});

beforeEach(() => {
  vi.clearAllMocks();
  // defaults tras clear
  vi.mocked(redisService.getFromRedis).mockResolvedValue(null);
  vi.mocked(redisService.getSearchBarcode).mockResolvedValue(null);
  vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(null);
  vi.mocked(cacheService.getCachedProductByNameKey).mockResolvedValue(null);
  vi.mocked(cacheService.setCachedProduct).mockResolvedValue('uuid-nuevo');
  vi.mocked(cacheService.findCachedProductByName).mockResolvedValue(null);
  vi.mocked(offService.resolveQueryToCode).mockResolvedValue(null);
  vi.mocked(offService.fetchProductByBarcode).mockResolvedValue(null);
  vi.mocked(obfService.fetchBeautyProductByBarcode).mockResolvedValue(null);
  vi.mocked(edamamService.fetchEdamamByBarcode).mockResolvedValue(null);
  vi.mocked(claudeService.aiLookupProduct).mockResolvedValue(null);
  vi.mocked(claudeService.enrichWithAI).mockImplementation(async (off) => off);
});

describe('lookupProduct — barcode cacheado en Supabase', () => {
  it('se sirve recomputado sin llamar a OFF ni Claude', async () => {
    vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(cachedHit());

    const product = await lookupProduct('7790895000123');

    expect(product).not.toBeNull();
    expect(product?.name).toBe('Galletitas');
    expect(product?.dataSource).toBe('off');
    // La identidad viaja en el payload (la usa el cliente para guardar).
    expect(product?.productId).toBe('uuid-galletitas');
    expect(cacheService.getCachedProductByBarcode).toHaveBeenCalledWith('7790895000123');
    // No se tocó el cold path.
    expect(offService.fetchProductByBarcode).not.toHaveBeenCalled();
    expect(claudeService.enrichWithAI).not.toHaveBeenCalled();
    expect(claudeService.aiLookupProduct).not.toHaveBeenCalled();
  });
});

describe('lookupProduct — Redis', () => {
  it('entrada con productId se sirve directo (hit)', async () => {
    vi.mocked(redisService.getFromRedis).mockResolvedValue({
      name: 'Galletitas',
      dataSource: 'off',
      productId: 'uuid-redis',
    } as unknown as FitogenixProduct);

    const product = await lookupProduct('7790895000123');

    expect(product?.productId).toBe('uuid-redis');
    // Ni Supabase ni cold path.
    expect(cacheService.getCachedProductByBarcode).not.toHaveBeenCalled();
    expect(offService.fetchProductByBarcode).not.toHaveBeenCalled();
  });

  it('entrada vieja SIN productId (pre-006) se trata como miss y la repobla Supabase', async () => {
    vi.mocked(redisService.getFromRedis).mockResolvedValue({
      name: 'Galletitas',
      dataSource: 'off',
      cacheKey: '7790895000123', // forma vieja
    } as unknown as FitogenixProduct);
    vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(cachedHit());

    const product = await lookupProduct('7790895000123');

    expect(product?.productId).toBe('uuid-galletitas');
    expect(cacheService.getCachedProductByBarcode).toHaveBeenCalledWith('7790895000123');
    // Se re-escribió Redis con el payload nuevo (que ya trae productId).
    expect(redisService.setInRedis).toHaveBeenCalledWith(
      '7790895000123',
      expect.objectContaining({ productId: 'uuid-galletitas' }),
      604800,
    );
  });
});

describe('lookupProduct — búsqueda por texto con search-cache hit', () => {
  it('salta resolveQueryToCode y va directo al barcode cacheado', async () => {
    vi.mocked(redisService.getSearchBarcode).mockResolvedValue('7790895000123');
    vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(cachedHit());

    const product = await lookupProduct('galletitas marca');

    expect(product?.name).toBe('Galletitas');
    expect(product?.productId).toBe('uuid-galletitas');
    expect(offService.resolveQueryToCode).not.toHaveBeenCalled();
    expect(cacheService.getCachedProductByBarcode).toHaveBeenCalledWith('7790895000123');
  });
});

describe('lookupProduct — búsqueda por nombre sin match en OFF (solo IA)', () => {
  it('cachea con nameKey SIN prefijo, awaitea el upsert y expone el id devuelto', async () => {
    vi.mocked(offService.resolveQueryToCode).mockResolvedValue(null);
    vi.mocked(claudeService.aiLookupProduct).mockResolvedValue(rawProduct);
    vi.mocked(cacheService.setCachedProduct).mockResolvedValue('uuid-alfajor');

    const product = await lookupProduct('Alfajór  Artesanal');

    expect(product?.name).toBe('Galletitas');
    // A la DB va el query normalizado SIN el prefijo 'name:' (ese prefijo
    // queda solo en las claves internas de Redis/in-flight/logs).
    expect(cacheService.setCachedProduct).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { nameKey: 'alfajor artesanal' },
    );
    // El upsert awaiteado devuelve el id y viaja en el payload.
    expect(product?.productId).toBe('uuid-alfajor');
  });

  it('segunda búsqueda idéntica se sirve del cache por name_key sin llamar a la IA', async () => {
    vi.mocked(offService.resolveQueryToCode).mockResolvedValue(null);
    vi.mocked(cacheService.getCachedProductByNameKey).mockImplementation(async (key: string) =>
      key === 'alfajor artesanal'
        ? cachedHit({
            dataSource: 'ai',
            productId: 'uuid-alfajor',
            barcode: null,
            nameKey: 'alfajor artesanal',
          })
        : null,
    );

    const product = await lookupProduct('Alfajór  Artesanal');

    expect(product?.name).toBe('Galletitas');
    expect(product?.dataSource).toBe('ai');
    expect(product?.productId).toBe('uuid-alfajor');
    expect(cacheService.getCachedProductByNameKey).toHaveBeenCalledWith('alfajor artesanal');
    expect(claudeService.aiLookupProduct).not.toHaveBeenCalled();
    expect(cacheService.setCachedProduct).not.toHaveBeenCalled();
  });

  it('si el upsert falla (null), el producto se sirve igual con productId vacío', async () => {
    vi.mocked(offService.resolveQueryToCode).mockResolvedValue(null);
    vi.mocked(claudeService.aiLookupProduct).mockResolvedValue(rawProduct);
    vi.mocked(cacheService.setCachedProduct).mockResolvedValue(null);

    const product = await lookupProduct('alfajor artesanal');

    expect(product?.name).toBe('Galletitas');
    expect(product?.productId).toBe('');
  });
});

describe('lookupProduct — búsqueda por texto con hit en catálogo propio', () => {
  it('OFF search falla pero el catálogo tiene el producto → se sirve sin IA', async () => {
    vi.mocked(offService.resolveQueryToCode).mockResolvedValue(null);
    vi.mocked(cacheService.findCachedProductByName).mockResolvedValue(
      cachedHit({ productId: 'uuid-coca', barcode: '57045399' }),
    );

    const product = await lookupProduct('galletitas marca');

    expect(product?.name).toBe('Galletitas');
    // productId y dataSource vienen de la fila del catálogo.
    expect(product?.productId).toBe('uuid-coca');
    expect(product?.dataSource).toBe('off');
    // No se gastó IA ni se creó una fila solo-IA duplicada.
    expect(claudeService.aiLookupProduct).not.toHaveBeenCalled();
    expect(cacheService.setCachedProduct).not.toHaveBeenCalled();
    // Redis se pobló bajo la clave interna de la fila (su barcode), TTL 7 días.
    expect(redisService.setInRedis).toHaveBeenCalledWith('57045399', expect.any(Object), 604800);
    // Y se cacheó query→barcode para saltar directo la próxima vez.
    expect(redisService.setSearchBarcode).toHaveBeenCalledWith('galletitas marca', '57045399');
  });

  it('hit de catálogo sin barcode (fila solo-IA) no cachea query→barcode', async () => {
    vi.mocked(offService.resolveQueryToCode).mockResolvedValue(null);
    vi.mocked(cacheService.findCachedProductByName).mockResolvedValue(
      cachedHit({
        raw: { ...rawProduct, _aiSource: true },
        dataSource: 'ai',
        productId: 'uuid-name',
        barcode: null,
        nameKey: 'galletitas marca',
      }),
    );

    const product = await lookupProduct('galletitas marca');

    expect(product?.productId).toBe('uuid-name');
    expect(product?.dataSource).toBe('ai');
    expect(claudeService.aiLookupProduct).not.toHaveBeenCalled();
    expect(redisService.setSearchBarcode).not.toHaveBeenCalled();
    // Clave interna 'name:<name_key>' y TTL corto (3 días) por ser dato de IA.
    expect(redisService.setInRedis).toHaveBeenCalledWith(
      'name:galletitas marca',
      expect.any(Object),
      259200,
    );
  });

  it('si el catálogo falla, la cascada sigue a la IA (no crashea)', async () => {
    vi.mocked(offService.resolveQueryToCode).mockResolvedValue(null);
    vi.mocked(cacheService.findCachedProductByName).mockRejectedValue(new Error('boom'));
    vi.mocked(claudeService.aiLookupProduct).mockResolvedValue(rawProduct);

    const product = await lookupProduct('alfajor artesanal');

    expect(product?.name).toBe('Galletitas');
    expect(claudeService.aiLookupProduct).toHaveBeenCalled();
    expect(cacheService.setCachedProduct).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { nameKey: 'alfajor artesanal' },
    );
  });
});

describe('lookupProduct — cascada de fuentes por barcode', () => {
  const beautyRaw: RawOFFProduct = {
    product_name: 'Crema Hidratante',
    brands: 'Nivea',
    ingredients_text: 'aqua, glycerin',
    nutriments: {},
  };
  const edamamRaw: RawOFFProduct = {
    product_name: 'Snack Edamam',
    brands: 'EdaBrand',
    nutriments: { sugars_100g: 5, proteins_100g: 10 },
  };

  it('(a) OFF falla pero OBF encuentra el producto', async () => {
    vi.mocked(offService.fetchProductByBarcode).mockResolvedValue(null);
    vi.mocked(obfService.fetchBeautyProductByBarcode).mockResolvedValue(beautyRaw);

    const product = await lookupProduct('8410757001090');

    expect(product?.name).toBe('Crema Hidratante');
    expect(product?.dataSource).toBe('obf');
    // Cold path: el upsert awaiteado devuelve el id → payload.
    expect(product?.productId).toBe('uuid-nuevo');
    expect(obfService.fetchBeautyProductByBarcode).toHaveBeenCalledWith('8410757001090');
    // No cayó a Edamam ni a Claude.
    expect(edamamService.fetchEdamamByBarcode).not.toHaveBeenCalled();
    expect(claudeService.aiLookupProduct).not.toHaveBeenCalled();
    // Persistió el crudo referenciado por su barcode.
    expect(cacheService.setCachedProduct).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { barcode: '8410757001090' },
    );
  });

  it('(b) OFF y OBF fallan pero Edamam encuentra el producto', async () => {
    vi.mocked(offService.fetchProductByBarcode).mockResolvedValue(null);
    vi.mocked(obfService.fetchBeautyProductByBarcode).mockResolvedValue(null);
    vi.mocked(edamamService.fetchEdamamByBarcode).mockResolvedValue(edamamRaw);

    const product = await lookupProduct('7622210449283');

    expect(product?.name).toBe('Snack Edamam');
    expect(product?.dataSource).toBe('edamam');
    expect(offService.fetchProductByBarcode).toHaveBeenCalled();
    expect(obfService.fetchBeautyProductByBarcode).toHaveBeenCalled();
    expect(edamamService.fetchEdamamByBarcode).toHaveBeenCalledWith('7622210449283');
    expect(claudeService.aiLookupProduct).not.toHaveBeenCalled();
  });

  it('(c) todas las fuentes gratis/pagas fallan y Claude resuelve', async () => {
    vi.mocked(offService.fetchProductByBarcode).mockResolvedValue(null);
    vi.mocked(obfService.fetchBeautyProductByBarcode).mockResolvedValue(null);
    vi.mocked(edamamService.fetchEdamamByBarcode).mockResolvedValue(null);
    vi.mocked(claudeService.aiLookupProduct).mockResolvedValue({
      ...rawProduct,
      _aiSource: true,
    });

    const product = await lookupProduct('9999999999999');

    expect(product?.name).toBe('Galletitas');
    expect(product?.dataSource).toBe('ai');
    expect(offService.fetchProductByBarcode).toHaveBeenCalled();
    expect(obfService.fetchBeautyProductByBarcode).toHaveBeenCalled();
    expect(edamamService.fetchEdamamByBarcode).toHaveBeenCalled();
    expect(claudeService.aiLookupProduct).toHaveBeenCalled();
  });

  it('si un nivel lanza, la cascada continúa (no crashea)', async () => {
    vi.mocked(offService.fetchProductByBarcode).mockRejectedValue(new Error('boom'));
    vi.mocked(obfService.fetchBeautyProductByBarcode).mockResolvedValue(beautyRaw);

    const product = await lookupProduct('8410757001090');

    expect(product?.name).toBe('Crema Hidratante');
    expect(product?.dataSource).toBe('obf');
  });

  it('OBF y Edamam NO se consultan en búsquedas por nombre (sin barcode)', async () => {
    vi.mocked(offService.resolveQueryToCode).mockResolvedValue(null);
    vi.mocked(claudeService.aiLookupProduct).mockResolvedValue(rawProduct);

    await lookupProduct('alfajor artesanal');

    expect(obfService.fetchBeautyProductByBarcode).not.toHaveBeenCalled();
    expect(edamamService.fetchEdamamByBarcode).not.toHaveBeenCalled();
  });
});

describe('lookupProduct — singleflight', () => {
  it('dos llamadas concurrentes al mismo barcode comparten una sola resolución', async () => {
    // Cache/redis miss → llega al fetchData. La fn de fetch debe invocarse 1 vez.
    const fetchSpy = vi
      .mocked(offService.fetchProductByBarcode)
      .mockImplementation(async () => rawProduct);

    const [a, b] = await Promise.all([
      lookupProduct('7790895000123'),
      lookupProduct('7790895000123'),
    ]);

    expect(a?.name).toBe('Galletitas');
    expect(b?.name).toBe('Galletitas');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
