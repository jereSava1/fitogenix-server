import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedRaw } from './cacheService';
import type { FitogenixProduct, RawOFFProduct } from '../types/fitogenix';

// ── Mocks de los módulos de servicios ──
vi.mock('./cacheService', () => ({
  getCachedProduct: vi.fn(),
  setCachedProduct: vi.fn(async () => undefined),
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
  vi.mocked(cacheService.getCachedProduct).mockResolvedValue(null);
  vi.mocked(offService.resolveQueryToCode).mockResolvedValue(null);
  vi.mocked(offService.fetchProductByBarcode).mockResolvedValue(null);
  vi.mocked(obfService.fetchBeautyProductByBarcode).mockResolvedValue(null);
  vi.mocked(edamamService.fetchEdamamByBarcode).mockResolvedValue(null);
  vi.mocked(claudeService.aiLookupProduct).mockResolvedValue(null);
  vi.mocked(claudeService.enrichWithAI).mockImplementation(async (off) => off);
});

describe('lookupProduct — barcode cacheado en Supabase', () => {
  it('se sirve recomputado sin llamar a OFF ni Claude', async () => {
    vi.mocked(cacheService.getCachedProduct).mockResolvedValue({
      raw: rawProduct,
      dataSource: 'off',
    } satisfies CachedRaw);

    const product = await lookupProduct('7790895000123');

    expect(product).not.toBeNull();
    expect(product?.name).toBe('Galletitas');
    expect(product?.dataSource).toBe('off');
    // No se tocó el cold path.
    expect(offService.fetchProductByBarcode).not.toHaveBeenCalled();
    expect(claudeService.enrichWithAI).not.toHaveBeenCalled();
    expect(claudeService.aiLookupProduct).not.toHaveBeenCalled();
  });
});

describe('lookupProduct — búsqueda por texto con search-cache hit', () => {
  it('salta resolveQueryToCode y va directo al barcode cacheado', async () => {
    vi.mocked(redisService.getSearchBarcode).mockResolvedValue('7790895000123');
    vi.mocked(cacheService.getCachedProduct).mockResolvedValue({
      raw: rawProduct,
      dataSource: 'off',
    } satisfies CachedRaw);

    const product = await lookupProduct('galletitas marca');

    expect(product?.name).toBe('Galletitas');
    expect(offService.resolveQueryToCode).not.toHaveBeenCalled();
    expect(cacheService.getCachedProduct).toHaveBeenCalledWith('7790895000123');
  });
});

describe('lookupProduct — búsqueda por nombre sin match en OFF (solo IA)', () => {
  it('cachea el resultado con cache_key "name:<...>" y barcode null', async () => {
    vi.mocked(offService.resolveQueryToCode).mockResolvedValue(null);
    vi.mocked(claudeService.aiLookupProduct).mockResolvedValue(rawProduct);

    const product = await lookupProduct('Alfajór  Artesanal');

    expect(product?.name).toBe('Galletitas');
    // Se persistió bajo la clave de nombre normalizada (minúsculas, sin acento,
    // espacios colapsados) y sin barcode.
    expect(cacheService.setCachedProduct).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      'name:alfajor artesanal',
      null,
    );
  });

  it('segunda búsqueda idéntica se sirve del cache sin llamar a la IA', async () => {
    vi.mocked(offService.resolveQueryToCode).mockResolvedValue(null);
    vi.mocked(cacheService.getCachedProduct).mockImplementation(async (key: string) =>
      key === 'name:alfajor artesanal' ? { raw: rawProduct, dataSource: 'ai' } : null,
    );

    const product = await lookupProduct('Alfajór  Artesanal');

    expect(product?.name).toBe('Galletitas');
    expect(product?.dataSource).toBe('ai');
    expect(claudeService.aiLookupProduct).not.toHaveBeenCalled();
    expect(cacheService.setCachedProduct).not.toHaveBeenCalled();
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
    expect(obfService.fetchBeautyProductByBarcode).toHaveBeenCalledWith('8410757001090');
    // No cayó a Edamam ni a Claude.
    expect(edamamService.fetchEdamamByBarcode).not.toHaveBeenCalled();
    expect(claudeService.aiLookupProduct).not.toHaveBeenCalled();
    // Persistió el crudo bajo la clave = barcode.
    expect(cacheService.setCachedProduct).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      '8410757001090',
      '8410757001090',
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
