// Presentación en la respuesta, con el motor simulado: se fuerza cada puntaje de borde.
import { describe, expect, it, vi } from 'vitest';
import { toProductDetail, toProductSummary } from './productResponse';

const forcedScore = vi.hoisted(() => ({ value: null as number | null }));

vi.mock('../../scoring', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../scoring')>();
  return {
    ...original,
    scoreProduct: () => ({
      score: forcedScore.value,
      scoreAvailable: forcedScore.value != null,
      noScore: forcedScore.value == null ? { code: 'sin-ingredientes', message: 'sin datos' } : null,
      ingredients: [],
      allergenWarnings: [],
    }),
  };
});

describe('caracterización — presentación en la respuesta (T-02)', () => {
  const BORDES: ReadonlyArray<[
    number | null,
    { scoreLabel: string; scoreColor: string; fito: string; highlight: string },
  ]> = [
    [0, { scoreLabel: 'MALO', scoreColor: '#dc2626', fito: 'nofito', highlight: 'cuestionables' }],
    [24, { scoreLabel: 'MALO', scoreColor: '#dc2626', fito: 'nofito', highlight: 'cuestionables' }],
    [25, { scoreLabel: 'MODERADO', scoreColor: '#f97316', fito: 'none', highlight: 'cuestionables' }],
    [39, { scoreLabel: 'MODERADO', scoreColor: '#f97316', fito: 'none', highlight: 'cuestionables' }],
    [40, { scoreLabel: 'MODERADO', scoreColor: '#f97316', fito: 'none', highlight: 'cuestionables' }],
    [49, { scoreLabel: 'MODERADO', scoreColor: '#f97316', fito: 'none', highlight: 'cuestionables' }],
    [50, { scoreLabel: 'BUENO', scoreColor: '#84cc16', fito: 'none', highlight: 'beneficiosos' }],
    [74, { scoreLabel: 'BUENO', scoreColor: '#84cc16', fito: 'none', highlight: 'beneficiosos' }],
    [75, { scoreLabel: 'EXCELENTE', scoreColor: '#16a34a', fito: 'fito', highlight: 'beneficiosos' }],
    [100, { scoreLabel: 'EXCELENTE', scoreColor: '#16a34a', fito: 'fito', highlight: 'beneficiosos' }],
    // Sin puntaje no se destaca ningún grupo (D-71).
    [null, { scoreLabel: 'SIN DATOS SUFICIENTES', scoreColor: '#9ca3af', fito: 'none', highlight: 'ninguno' }],
  ];

  it.each(BORDES)('puntaje %s', (score, esperado) => {
    forcedScore.value = score;
    const identidad = { id: 'uuid-producto', fallbackName: '7790000000000' };
    const product = toProductDetail({ product_name: 'Producto' }, identidad);

    expect(product.score).toBe(score);
    expect({
      scoreLabel: product.scoreLabel,
      scoreColor: product.scoreColor,
      fito: product.fito,
      highlight: product.highlight,
    }).toEqual(esperado);
    // El resumen de los listados lleva la misma presentación.
    const { scoreLabel, scoreColor } = toProductSummary({ product_name: 'Producto' }, identidad);
    expect({ scoreLabel, scoreColor }).toEqual({ scoreLabel: esperado.scoreLabel, scoreColor: esperado.scoreColor });
  });
});
