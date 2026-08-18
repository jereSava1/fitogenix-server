import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedProductRow } from './cacheService';
import type { FitogenixProduct, RawOFFProduct } from '../types/fitogenix';

/**
 * Búsqueda SOLO catálogo propio (decisión de producto, 2026-08-18): sin
 * cascada a OFF/OBF/Edamam/Claude. Si Redis y Supabase no tienen el
 * producto, `lookupProduct` devuelve `null` — no hay proveedores externos
 * que mockear acá.
 */
vi.mock('./cacheService', () => ({
  getCachedProductByBarcode: vi.fn(async () => null),
  findCachedProductByName: vi.fn(async () => null),
}));
vi.mock('./redisService', () => ({
  getFromRedis: vi.fn(async () => null),
  setInRedis: vi.fn(async () => undefined),
  getSearchBarcode: vi.fn(async () => null),
  setSearchBarcode: vi.fn(async () => undefined),
}));

type LookupModule = typeof import('./productLookupService');
let lookupProduct: LookupModule['lookupProduct'];
let cacheService: typeof import('./cacheService');
let redisService: typeof import('./redisService');

const rawProduct: RawOFFProduct = {
  product_name: 'Galletitas',
  brands: 'Marca',
  ingredients_text: 'harina, azucar',
  nutriments: { sugars_100g: 20 },
  nova_group: 4,
};

// Hit de catálogo con la forma nueva (identidad + atributos de búsqueda).
const cachedHit = (overrides: Partial<CachedProductRow> = {}): CachedProductRow => ({
  raw: rawProduct,
  dataSource: 'off',
  productId: 'uuid-galletitas',
  barcode: '7790895000123',
  nameKey: null,
  ...overrides,
});

beforeAll(async () => {
  ({ lookupProduct } = await import('./productLookupService'));
  cacheService = await import('./cacheService');
  redisService = await import('./redisService');
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(redisService.getFromRedis).mockResolvedValue(null);
  vi.mocked(redisService.getSearchBarcode).mockResolvedValue(null);
  vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(null);
  vi.mocked(cacheService.findCachedProductByName).mockResolvedValue(null);
});

describe('lookupProduct — barcode', () => {
  it('hit en Supabase: se sirve recomputado y se pobla Redis', async () => {
    vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(cachedHit());

    const product = await lookupProduct('7790895000123');

    expect(product).not.toBeNull();
    expect(product?.name).toBe('Galletitas');
    expect(product?.dataSource).toBe('off');
    expect(product?.productId).toBe('uuid-galletitas');
    expect(cacheService.getCachedProductByBarcode).toHaveBeenCalledWith('7790895000123');
    expect(redisService.setInRedis).toHaveBeenCalledWith(
      '7790895000123',
      expect.objectContaining({ productId: 'uuid-galletitas' }),
      604800,
    );
  });

  it('miss en Redis y Supabase: null, sin ningún proveedor externo que consultar', async () => {
    const product = await lookupProduct('7790895000123');

    expect(product).toBeNull();
    expect(cacheService.getCachedProductByBarcode).toHaveBeenCalledWith('7790895000123');
  });

  it('TTL de 3 días cuando la fila es de origen IA (dato menos confiable, se refresca antes)', async () => {
    vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(
      cachedHit({ dataSource: 'ai' }),
    );

    await lookupProduct('7790895000123');

    expect(redisService.setInRedis).toHaveBeenCalledWith(
      '7790895000123',
      expect.any(Object),
      259200,
    );
  });
});

describe('lookupProduct — Redis', () => {
  it('entrada con productId se sirve directo (hit), sin tocar Supabase', async () => {
    vi.mocked(redisService.getFromRedis).mockResolvedValue({
      name: 'Galletitas',
      dataSource: 'off',
      productId: 'uuid-redis',
    } as unknown as FitogenixProduct);

    const product = await lookupProduct('7790895000123');

    expect(product?.productId).toBe('uuid-redis');
    expect(cacheService.getCachedProductByBarcode).not.toHaveBeenCalled();
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
  });
});

describe('lookupProduct — búsqueda por texto con search-cache hit', () => {
  it('salta la búsqueda en catálogo y va directo al barcode cacheado', async () => {
    vi.mocked(redisService.getSearchBarcode).mockResolvedValue('7790895000123');
    vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(cachedHit());

    const product = await lookupProduct('galletitas marca');

    expect(product?.name).toBe('Galletitas');
    expect(product?.productId).toBe('uuid-galletitas');
    expect(cacheService.findCachedProductByName).not.toHaveBeenCalled();
    expect(cacheService.getCachedProductByBarcode).toHaveBeenCalledWith('7790895000123');
  });
});

describe('lookupProduct — búsqueda por texto contra el catálogo', () => {
  it('hit con barcode: se sirve, cachea query→barcode, NO duplica el producto bajo la clave de texto', async () => {
    vi.mocked(cacheService.findCachedProductByName).mockResolvedValue(
      cachedHit({ productId: 'uuid-coca', barcode: '57045399' }),
    );

    const product = await lookupProduct('galletitas marca');

    expect(product?.name).toBe('Galletitas');
    expect(product?.productId).toBe('uuid-coca');
    expect(product?.dataSource).toBe('off');
    expect(redisService.setSearchBarcode).toHaveBeenCalledWith('galletitas marca', '57045399');
    // La próxima vez entra por el camino de barcode: no hace falta cachear
    // el producto bajo 'name:...' también.
    expect(redisService.setInRedis).not.toHaveBeenCalled();
  });

  it('hit sin barcode (fila solo-nombre): cachea bajo la clave de texto, no hay barcode que asociar', async () => {
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
    expect(redisService.setSearchBarcode).not.toHaveBeenCalled();
    expect(redisService.setInRedis).toHaveBeenCalledWith(
      'name:galletitas marca',
      expect.any(Object),
      259200, // TTL corto por ser dato de IA
    );
  });

  it('sin match en el catálogo: null, sin cascada a ningún proveedor externo', async () => {
    const product = await lookupProduct('un producto que no existe en ningún lado');

    expect(product).toBeNull();
    expect(cacheService.findCachedProductByName).toHaveBeenCalledWith(
      'un producto que no existe en ningún lado',
    );
  });

  it('si el catálogo lanza, lookupProduct propaga el error en vez de inventar una cascada', async () => {
    vi.mocked(cacheService.findCachedProductByName).mockRejectedValue(new Error('boom'));

    await expect(lookupProduct('alfajor artesanal')).rejects.toThrow('boom');
  });
});

describe('lookupProduct — singleflight', () => {
  it('dos búsquedas de barcode concurrentes comparten una sola resolución', async () => {
    let calls = 0;
    vi.mocked(cacheService.getCachedProductByBarcode).mockImplementation(async () => {
      calls += 1;
      return cachedHit();
    });

    const [a, b] = await Promise.all([
      lookupProduct('7790895000123'),
      lookupProduct('7790895000123'),
    ]);

    expect(a?.name).toBe('Galletitas');
    expect(b?.name).toBe('Galletitas');
    expect(calls).toBe(1);
  });

  it('dos búsquedas de texto concurrentes comparten una sola resolución', async () => {
    let calls = 0;
    vi.mocked(cacheService.findCachedProductByName).mockImplementation(async () => {
      calls += 1;
      return cachedHit({ barcode: null, nameKey: 'galletitas marca' });
    });

    const [a, b] = await Promise.all([
      lookupProduct('galletitas marca'),
      lookupProduct('galletitas marca'),
    ]);

    expect(a?.name).toBe('Galletitas');
    expect(b?.name).toBe('Galletitas');
    expect(calls).toBe(1);
  });
});
