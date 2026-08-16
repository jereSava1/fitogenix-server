/**
 * Contrato de POST /products/lookup.
 *
 * Lo que fija este archivo: el JSON Schema de respuesta (lookupSchema.ts) NO
 * recorta el payload. fast-json-stringify elimina en silencio toda propiedad
 * que el schema no declare, así que un campo nuevo en `FitogenixProduct` que
 * nadie agregó al schema desaparecería de la respuesta sin que falle nada.
 * Acá se compara la respuesta contra el producto ENTERO, con un breakdown real
 * salido del motor.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { ftgScoreWithBreakdown, extractNutrition } from '../../domain/product/ftgEngine';
import type { FitogenixProduct } from '../../types/fitogenix';

vi.mock('../../services/productLookupService', () => ({
  lookupProduct: vi.fn(async () => null),
}));
vi.mock('../../services/scanHistoryService', () => ({
  recordScan: vi.fn(async () => undefined),
  resolveUserIdFromToken: vi.fn(async () => null),
}));

type Lookup = typeof import('../../services/productLookupService');
let productLookupService: Lookup;
let buildApp: () => Promise<ReturnType<typeof Fastify>>;

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  process.env.SERPAPI_API_KEY = 'test';

  const { productLookupRoute } = await import('./lookup');
  productLookupService = await import('../../services/productLookupService');

  buildApp = async () => {
    const app = Fastify();
    await app.register(productLookupRoute);
    await app.ready();
    return app;
  };
});

beforeEach(() => {
  vi.mocked(productLookupService.lookupProduct).mockReset();
});

/**
 * Producto armado con un breakdown REAL del motor v2.1 — no un objeto de
 * fantasía. Si el motor agrega un campo al breakdown y el schema no lo
 * declara, este test lo caza.
 */
function producto(raw: Parameters<typeof ftgScoreWithBreakdown>[0]): FitogenixProduct {
  const breakdown = ftgScoreWithBreakdown(raw);
  return {
    id: '7790895000123',
    name: 'Producto de prueba',
    subtitle: '120 g',
    brand: 'Marca',
    category: 'Galletitas',
    categoryEmoji: '🍽️',
    score: breakdown.score,
    scoreAvailable: breakdown.scoreAvailable,
    noScore: breakdown.noScore,
    flagged: breakdown.score != null && breakdown.score < 40,
    emoji: '📦',
    bgColor: '#f8faf7',
    imageUrl: 'https://example.com/p.jpg',
    ingredients: breakdown.ingredients,
    nutrition: extractNutrition(raw.nutriments),
    breakdown,
    dataSource: 'off',
    aiEnriched: false,
    productId: '6f1e2c3d-0000-4000-8000-000000000001',
    scoreLabel: 'MALO',
    scoreColor: '#dc2626',
    tagline: 'No lo recomendamos',
    fito: 'nofito',
  };
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

  it('el desglose viaja con steps[] y sin los 4 ejes de v2', async () => {
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
    expect(Array.isArray(body.breakdown.steps)).toBe(true);
    expect(body.breakdown.steps.length).toBeGreaterThan(0);
    expect(body.breakdown.engineVersion).toBe('ftg-rubric-v2.1');
    // La forma vieja no puede colarse ni aunque el producto la trajera.
    expect(body).not.toHaveProperty('subscores');
    expect(body.breakdown).not.toHaveProperty('components');
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
    expect(body.scoreAvailable).toBe(false);
    expect(body.noScore).not.toBeNull();
    expect(typeof body.noScore.code).toBe('string');
    expect(typeof body.noScore.message).toBe('string');
    await app.close();
  });

  it('breakdown null también viaja como null', async () => {
    const base = producto({ ingredients_text: 'agua, sal' });
    vi.mocked(productLookupService.lookupProduct).mockResolvedValue({
      ...base,
      breakdown: null,
      subtitle: null,
      imageUrl: null,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/products/lookup',
      payload: { query: 'agua' },
    });

    const body = res.json();
    expect(body.breakdown).toBeNull();
    expect(body.subtitle).toBeNull();
    expect(body.imageUrl).toBeNull();
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
    expect(res.json()).toEqual({ error: 'Producto no encontrado' });
    await app.close();
  });
});
