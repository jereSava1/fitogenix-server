// fast-json-stringify borra en silencio lo que el schema no declara: acá se compara
// la respuesta contra el producto entero (y que `breakdown` no viaje).

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { AJV_OPTIONS } from '../../../platform/http/buildApp';
import { registerErrorHandling } from '../../../platform/http/errors';
import type { LookupProduct } from '../application/lookupProduct';
import { toProductDetail, type ProductDetail } from '../application/productResponse';
import type { RawProduct } from '../domain/rawProduct';
import type { OnScan } from './lookup.route';

const productLookupService = {
  lookupProduct: vi.fn<LookupProduct>(async () => null),
};
let buildApp: (onScan?: OnScan) => Promise<ReturnType<typeof Fastify>>;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';

  const { lookupRoutes } = await import('./lookup.route');

  buildApp = async (onScan?: OnScan) => {
    const app = Fastify({ ajv: AJV_OPTIONS });
    registerErrorHandling(app); // como en producción (buildApp)
    await app.register(lookupRoutes({ lookup: productLookupService.lookupProduct, onScan }));
    await app.ready();
    return app;
  };
});

beforeEach(() => {
  vi.mocked(productLookupService.lookupProduct).mockReset();
});

/** Producto con un cálculo real del motor, armado igual que en el lookup. */
function producto(raw: RawProduct): ProductDetail {
  return toProductDetail(
    { brands: 'Marca', image_url: 'https://example.com/p.jpg', ...raw },
    { id: '6f1e2c3d-0000-4000-8000-000000000001', fallbackName: '7790895000123' },
  );
}

describe('POST /products/lookup — contrato de respuesta', () => {
  it('serializa el producto COMPLETO, sin recortar campos', async () => {
    const esperado = producto({
      product_name: 'Galletitas rellenas',
      ingredients_text: 'harina de trigo, azúcar, aceite vegetal, jarabe de glucosa, sal',
      nutriments: { sugars_100g: 38, 'energy-kcal_100g': 480, salt_100g: 1.1 },
    });
    vi.mocked(productLookupService.lookupProduct).mockResolvedValue(esperado);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/products/lookup',
      payload: { query: '7790895000123' },
    });

    expect(res.statusCode).toBe(200);
    // Igualdad ESTRUCTURAL contra el objeto entero: cualquier campo que el
    // schema se coma hace fallar esto.
    expect(res.json()).toEqual(JSON.parse(JSON.stringify(esperado)));
    await app.close();
  });

  it('breakdown no viaja en la respuesta (decisión de producto, 2026-08-18)', async () => {
    const esperado = producto({
      product_name: 'Galletitas rellenas',
      ingredients_text: 'harina de trigo, azúcar, aceite vegetal',
    });
    vi.mocked(productLookupService.lookupProduct).mockResolvedValue(esperado);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/products/lookup',
      payload: { query: 'galletitas' },
    });

    const body = res.json();
    // Ni la forma vieja de v2 ni la de v2.1: ninguna de las dos se manda.
    expect(body).not.toHaveProperty('subscores');
    expect(body).not.toHaveProperty('breakdown');
    await app.close();
  });

  it('score null sobrevive la serialización (no se coerciona a 0 ni se omite)', async () => {
    // Producto fuera de alcance (§1): el motor no emite puntaje.
    const sinPuntaje = producto({
      product_name: 'Cerveza rubia',
      categories: 'Bebidas alcohólicas, Cervezas',
      ingredients_text: 'agua, malta de cebada, lúpulo',
    });
    expect(sinPuntaje.score).toBeNull(); // guard: el fixture es el que queremos
    vi.mocked(productLookupService.lookupProduct).mockResolvedValue(sinPuntaje);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/products/lookup',
      payload: { query: 'cerveza' },
    });

    const body = res.json();
    expect(body).toHaveProperty('score');
    expect(body.score).toBeNull();
    expect(body.highlight).toBe('ninguno'); // D-71
    expect(body.noScore).not.toBeNull();
    expect(typeof body.noScore.code).toBe('string');
    expect(typeof body.noScore.message).toBe('string');
    await app.close();
  });

  it('nulos legítimos (brand, imageUrl) viajan como null, no se omiten', async () => {
    const base = producto({ ingredients_text: 'agua, sal' });
    vi.mocked(productLookupService.lookupProduct).mockResolvedValue({
      ...base,
      brand: null,
      imageUrl: null,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/products/lookup',
      payload: { query: 'agua' },
    });

    const body = res.json();
    expect(body.brand).toBeNull();
    expect(body.imageUrl).toBeNull();
    await app.close();
  });

  // D-70: los campos de más se rechazan y no llegan al caso de uso.
  it('body con campos extra → 400 VALIDATION_ERROR, sin buscar (T-06, D-70)', async () => {
    vi.mocked(productLookupService.lookupProduct).mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/products/lookup',
      payload: { query: ' 7790895000123 ', userId: 'otro', extra: { a: 1 } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'La solicitud no es válida.', code: 'VALIDATION_ERROR' });
    expect(productLookupService.lookupProduct).not.toHaveBeenCalled();
    await app.close();
  });

  it('solo `query`: se busca con la query recortada', async () => {
    vi.mocked(productLookupService.lookupProduct).mockResolvedValue(null);

    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/products/lookup', payload: { query: ' 7790895000123 ' } });

    expect(productLookupService.lookupProduct).toHaveBeenCalledWith('7790895000123');
    await app.close();
  });

  it('producto no encontrado → 404 con el schema de error', async () => {
    vi.mocked(productLookupService.lookupProduct).mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/products/lookup',
      payload: { query: 'no existe' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: 'Todavía no tenemos este producto en nuestro catálogo.',
      code: 'PRODUCT_NOT_IN_CATALOG',
    });
    await app.close();
  });
});

describe('POST /products/lookup — registro del escaneo (M-05)', () => {
  const encontrado = producto({ product_name: 'Galletitas', ingredients_text: 'harina de trigo, azúcar' });

  it('con Bearer y producto encontrado: onScan recibe el token y el id del producto', async () => {
    productLookupService.lookupProduct.mockResolvedValue(encontrado);
    const onScan = vi.fn<OnScan>(async () => undefined);

    const app = await buildApp(onScan);
    const res = await app.inject({
      method: 'POST',
      url: '/products/lookup',
      headers: { authorization: 'Bearer token-123' },
      payload: { query: '7790895000123' },
    });

    expect(res.statusCode).toBe(200);
    await vi.waitFor(() =>
      expect(onScan).toHaveBeenCalledWith({ token: 'token-123', productId: encontrado.id }),
    );
    await app.close();
  });

  it('sin token, o sin producto: no se registra nada', async () => {
    const onScan = vi.fn<OnScan>(async () => undefined);
    const app = await buildApp(onScan);

    productLookupService.lookupProduct.mockResolvedValue(encontrado);
    await app.inject({ method: 'POST', url: '/products/lookup', payload: { query: 'x1' } });

    productLookupService.lookupProduct.mockResolvedValue(null);
    await app.inject({
      method: 'POST',
      url: '/products/lookup',
      headers: { authorization: 'Bearer token-123' },
      payload: { query: 'x2' },
    });

    expect(onScan).not.toHaveBeenCalled();
    await app.close();
  });

  it('si onScan falla, la respuesta igual sale 200 (fire-and-forget)', async () => {
    productLookupService.lookupProduct.mockResolvedValue(encontrado);
    const onScan = vi.fn<OnScan>(async () => {
      throw new Error('historial caído');
    });

    const app = await buildApp(onScan);
    const res = await app.inject({
      method: 'POST',
      url: '/products/lookup',
      headers: { authorization: 'Bearer token-123' },
      payload: { query: '7790895000123' },
    });

    expect(res.statusCode).toBe(200);
    await vi.waitFor(() => expect(onScan).toHaveBeenCalled());
    await app.close();
  });
});
