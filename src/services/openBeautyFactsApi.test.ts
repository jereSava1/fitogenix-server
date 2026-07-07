import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBeautyProductByBarcode } from './openBeautyFactsApi';

// Helper: stub de fetch que devuelve un JSON dado con status HTTP 200.
function stubFetchJson(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status,
      json: async () => body,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('openBeautyFactsApi — fetchBeautyProductByBarcode', () => {
  it('mapea un producto encontrado (status 1) a RawOFFProduct', async () => {
    stubFetchJson({
      code: '8410757001090',
      status: 1,
      product: {
        product_name: 'Crema Manos',
        brands: "S'nonas",
        ingredients_text: 'Aqua, Glycerin',
        categories: 'Creams',
        additives_tags: ['en:e330'],
      },
    });

    const result = await fetchBeautyProductByBarcode('8410757001090');

    expect(result).not.toBeNull();
    expect(result?.product_name).toBe('Crema Manos');
    expect(result?.brands).toBe("S'nonas");
    expect(result?.additives_tags).toEqual(['en:e330']);
  });

  it('devuelve null cuando el producto no existe (status 0)', async () => {
    stubFetchJson({ code: 'x', status: 0, status_verbose: 'product not found' });
    expect(await fetchBeautyProductByBarcode('4005900122328')).toBeNull();
  });

  it('devuelve null (sin lanzar) ante un barcode inválido', async () => {
    expect(await fetchBeautyProductByBarcode('abc')).toBeNull();
  });

  it('devuelve null y loguea si la API responde !ok', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetchJson({}, false, 503);
    expect(await fetchBeautyProductByBarcode('8410757001090')).toBeNull();
    expect(errSpy).toHaveBeenCalled();
  });

  it('devuelve null y loguea si fetch lanza (timeout/red)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    expect(await fetchBeautyProductByBarcode('8410757001090')).toBeNull();
    expect(errSpy).toHaveBeenCalled();
  });
});
