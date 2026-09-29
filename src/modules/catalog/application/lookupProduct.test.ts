import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedProductRow, ProductCache, ProductReader } from './ports';
import type { RawProduct } from '../domain/rawProduct';

// Solo catálogo propio: sin proveedores externos que simular. Los puertos se reemplazan
// por fakes.
const cacheService = {
  getProductById: vi.fn<ProductReader['findById']>(async () => null),
  getCachedProductByBarcode: vi.fn<ProductReader['findByBarcode']>(async () => null),
  findCachedProductByName: vi.fn<ProductReader['findByName']>(async () => null),
};
const redisService = {
  getFromRedis: vi.fn<ProductCache['get']>(async () => null),
  setInRedis: vi.fn<ProductCache['set']>(async () => undefined),
  getSearchBarcode: vi.fn<ProductCache['getBarcodeForQuery']>(async () => null),
  setSearchBarcode: vi.fn<ProductCache['setBarcodeForQuery']>(async () => undefined),
};

type LookupModule = typeof import('./lookupProduct');
let lookupProduct: ReturnType<LookupModule['makeLookupProduct']>;

const rawProduct: RawProduct = {
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
  const { makeLookupProduct } = await import('./lookupProduct');
  lookupProduct = makeLookupProduct({
    reader: {
      findById: cacheService.getProductById,
      findByBarcode: cacheService.getCachedProductByBarcode,
      findByName: cacheService.findCachedProductByName,
    },
    cache: {
      get: redisService.getFromRedis,
      set: redisService.setInRedis,
      getBarcodeForQuery: redisService.getSearchBarcode,
      setBarcodeForQuery: redisService.setSearchBarcode,
    },
  });
});

/** El `dataSource` logueado en la última resolución (no viaja en la respuesta). */
function loggedDataSource(): string | undefined {
  const calls = vi.mocked(console.info).mock.calls;
  const last = calls[calls.length - 1]?.[0];
  return typeof last === 'string' ? (JSON.parse(last) as { dataSource?: string }).dataSource : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => {});
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
    expect(loggedDataSource()).toBe('off');
    expect(product?.id).toBe('uuid-galletitas');
    expect(cacheService.getCachedProductByBarcode).toHaveBeenCalledWith('7790895000123');
    expect(redisService.setInRedis).toHaveBeenCalledWith(
      '7790895000123',
      expect.objectContaining({ productId: 'uuid-galletitas' }),
      604800,
    );
  });

  it('K-04: id es el uuid de la fila, sin dataSource ni productId en la respuesta', async () => {
    vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(cachedHit());

    const product = await lookupProduct('7790895000123');

    expect(product?.id).toBe('uuid-galletitas');
    expect(product).not.toHaveProperty('productId');
    expect(product).not.toHaveProperty('dataSource');
    expect(product).not.toHaveProperty('aiEnriched');
  });

  it('K-04: sin nombre en la fila, el nombre de reemplazo es la query', async () => {
    vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(
      cachedHit({ raw: { ...rawProduct, product_name: undefined } }),
    );

    expect((await lookupProduct('7790895000123'))?.name).toBe('7790895000123');
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
  it('entrada cruda: se recalcula y se sirve sin tocar Supabase (K-02)', async () => {
    vi.mocked(redisService.getFromRedis).mockResolvedValue({
      raw: rawProduct,
      dataSource: 'off',
      productId: 'uuid-redis',
    });

    const product = await lookupProduct('7790895000123');

    expect(product?.id).toBe('uuid-redis');
    expect(product?.name).toBe('Galletitas');
    expect(cacheService.getCachedProductByBarcode).not.toHaveBeenCalled();
  });

  it('un hit de Redis y uno de Supabase del mismo producto dan la MISMA respuesta (K-02)', async () => {
    // Por eso un campo nuevo del contrato no rompe las entradas cacheadas: la
    // respuesta se arma al leer, con el código de hoy.
    const fila = cachedHit();
    vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(fila);
    const desdeSupabase = await lookupProduct('7790895000123');

    vi.mocked(redisService.getFromRedis).mockResolvedValue({
      raw: fila.raw,
      dataSource: fila.dataSource,
      productId: fila.productId,
    });
    const desdeRedis = await lookupProduct('7790895000123');

    expect(desdeRedis).toStrictEqual(desdeSupabase);
  });

  it('lo que se guarda en Redis es el crudo de la fila, no la respuesta armada (K-02)', async () => {
    vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(cachedHit());

    await lookupProduct('7790895000123');

    expect(redisService.setInRedis).toHaveBeenCalledWith(
      '7790895000123',
      { raw: rawProduct, dataSource: 'off', productId: 'uuid-galletitas' },
      604800,
    );
  });
});

describe('lookupProduct — búsqueda por texto con search-cache hit', () => {
  it('salta la búsqueda en catálogo y va directo al barcode cacheado', async () => {
    vi.mocked(redisService.getSearchBarcode).mockResolvedValue('7790895000123');
    vi.mocked(cacheService.getCachedProductByBarcode).mockResolvedValue(cachedHit());

    const product = await lookupProduct('galletitas marca');

    expect(product?.name).toBe('Galletitas');
    expect(product?.id).toBe('uuid-galletitas');
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
    expect(product?.id).toBe('uuid-coca');
    expect(loggedDataSource()).toBe('off');
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

    expect(product?.id).toBe('uuid-name');
    expect(loggedDataSource()).toBe('ai');
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
