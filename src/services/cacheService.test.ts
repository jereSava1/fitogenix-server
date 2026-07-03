import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FitogenixProduct, RawOFFProduct } from '../types/fitogenix';

// ── Mock de Supabase ──
// createClient devuelve un cliente cuyo .from(...).select(...).eq(...).maybeSingle()
// resuelve a lo que dejemos en `mockRow`. maybeSingleImpl permite forzar errores.
let mockRow: Record<string, unknown> | null = null;
let mockError: unknown = null;

const maybeSingle = vi.fn(async () => ({ data: mockRow, error: mockError }));
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

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
  mockRow = null;
  mockError = null;
});

describe('buildCachePayload', () => {
  it('guarda los datos crudos y engine_version', () => {
    const raw: RawOFFProduct = {
      product_name: 'Galletitas',
      ingredients_text: 'harina, azucar',
      nutriments: { sugars_100g: 20 },
      nova_group: 4,
      additives_tags: ['en:e330'],
      _aiEnriched: true,
    };
    const product = {
      name: 'Galletitas',
      brand: 'Marca',
      category: 'Snacks',
      imageUrl: 'http://img',
      score: 42,
      dataSource: 'off',
      aiEnriched: true,
    } as unknown as FitogenixProduct;

    const payload = cache.buildCachePayload(product, raw, '7790001');

    expect(payload.barcode).toBe('7790001');
    expect(payload.ingredients_text).toBe('harina, azucar');
    expect(payload.nutriments).toEqual({ sugars_100g: 20 });
    expect(payload.nova_group).toBe(4);
    expect(payload.additives_tags).toEqual(['en:e330']);
    expect(payload.engine_version).toBe(ENGINE_VERSION);
    expect(payload.ai_enriched).toBe(true);
  });

  it('usa null para crudos ausentes', () => {
    const raw: RawOFFProduct = { product_name: 'X' };
    const product = {
      name: 'X',
      brand: '',
      category: '',
      imageUrl: null,
      score: 50,
      dataSource: 'off',
    } as unknown as FitogenixProduct;

    const payload = cache.buildCachePayload(product, raw, '111');
    expect(payload.ingredients_text).toBeNull();
    expect(payload.nutriments).toBeNull();
    expect(payload.nova_group).toBeNull();
    expect(payload.additives_tags).toBeNull();
  });
});

describe('getCachedProduct', () => {
  it('reconstruye el RawOFFProduct desde los crudos', async () => {
    mockRow = {
      barcode: '7790001',
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

    const result = await cache.getCachedProduct('7790001');
    expect(result).not.toBeNull();
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

  it('fila vieja sin ingredients_text NI nutriments → cache miss (null)', async () => {
    mockRow = {
      barcode: '7790001',
      product_name: 'Galletitas',
      brand: 'Marca',
      data_source: 'off',
    };
    await expect(cache.getCachedProduct('7790001')).resolves.toBeNull();
  });

  it('devuelve null cuando Supabase da error', async () => {
    mockError = { message: 'boom' };
    await expect(cache.getCachedProduct('7790001')).resolves.toBeNull();
  });
});
