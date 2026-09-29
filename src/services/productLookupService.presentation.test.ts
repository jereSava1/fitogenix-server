/* T-02 · Caracterización de la presentación en la respuesta del lookup
 * (docs/05-plan.md).
 *
 * `scorePresentation` y `flagged` son privados de `mapRawToProduct`, así que
 * se prueban a través de ella con el motor simulado: se fuerza cada puntaje de
 * borde y se mira qué campos de presentación salen en la respuesta.
 */
import { describe, expect, it, vi } from 'vitest';
import { mapRawToProduct } from './productLookupService';

const forcedScore = vi.hoisted(() => ({ value: null as number | null }));

vi.mock('../domain/product/ftgEngine', async (importOriginal) => {
  const original = await importOriginal<typeof import('../domain/product/ftgEngine')>();
  return {
    ...original,
    ftgScoreWithBreakdown: () => ({
      score: forcedScore.value,
      scoreAvailable: forcedScore.value != null,
      noScore: forcedScore.value == null ? { code: 'sin-ingredientes', message: 'sin datos' } : null,
      ingredients: [],
    }),
  };
});

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

describe('caracterización — presentación en la respuesta (T-02)', () => {
  const BORDES: ReadonlyArray<[
    number | null,
    { scoreLabel: string; scoreColor: string; fito: string; flagged: boolean },
  ]> = [
    [0, { scoreLabel: 'MALO', scoreColor: '#dc2626', fito: 'nofito', flagged: true }],
    [24, { scoreLabel: 'MALO', scoreColor: '#dc2626', fito: 'nofito', flagged: true }],
    [25, { scoreLabel: 'MODERADO', scoreColor: '#f97316', fito: 'none', flagged: true }],
    // CARACTERIZA: comportamiento actual, cambia en K-04. `flagged` corta en
    // < 40, que no coincide con ningún borde de banda: un Moderado de 39 sale
    // marcado y uno de 40 no.
    [39, { scoreLabel: 'MODERADO', scoreColor: '#f97316', fito: 'none', flagged: true }],
    [40, { scoreLabel: 'MODERADO', scoreColor: '#f97316', fito: 'none', flagged: false }],
    [49, { scoreLabel: 'MODERADO', scoreColor: '#f97316', fito: 'none', flagged: false }],
    [50, { scoreLabel: 'BUENO', scoreColor: '#84cc16', fito: 'none', flagged: false }],
    [74, { scoreLabel: 'BUENO', scoreColor: '#84cc16', fito: 'none', flagged: false }],
    [75, { scoreLabel: 'EXCELENTE', scoreColor: '#16a34a', fito: 'fito', flagged: false }],
    [100, { scoreLabel: 'EXCELENTE', scoreColor: '#16a34a', fito: 'fito', flagged: false }],
    [null, { scoreLabel: 'SIN DATOS SUFICIENTES', scoreColor: '#9ca3af', fito: 'none', flagged: false }],
  ];

  it.each(BORDES)('puntaje %s', (score, esperado) => {
    forcedScore.value = score;
    const product = mapRawToProduct({ product_name: 'Producto' }, '7790000000000');

    expect(product.score).toBe(score);
    expect({
      scoreLabel: product.scoreLabel,
      scoreColor: product.scoreColor,
      fito: product.fito,
      flagged: product.flagged,
    }).toEqual(esperado);
  });
});
