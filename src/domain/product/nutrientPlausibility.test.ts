import { describe, expect, it } from 'vitest';
import { findImplausibleNutrients } from './nutrientPlausibility';

describe('findImplausibleNutrients', () => {
  it('no marca nada para valores dentro de rango', () => {
    const result = findImplausibleNutrients({
      'energy-kcal_100g': 450,
      proteins_100g: 8,
      sugars_100g: 30,
      sodium_100g: 0.5,
    });
    expect(result).toHaveLength(0);
  });

  it('marca energy-kcal_100g fuera de rango físico (> 900)', () => {
    const result = findImplausibleNutrients({ 'energy-kcal_100g': 4500 });
    expect(result).toEqual([{ field: 'energy-kcal_100g', value: 4500 }]);
  });

  it('marca sodium_100g típico de error mg→g (ej. 3900 en vez de 3.9)', () => {
    const result = findImplausibleNutrients({ sodium_100g: 3900 });
    expect(result).toEqual([{ field: 'sodium_100g', value: 3900 }]);
  });

  it('marca un porcentaje imposible (> 100g en 100g)', () => {
    const result = findImplausibleNutrients({ proteins_100g: 150 });
    expect(result).toEqual([{ field: 'proteins_100g', value: 150 }]);
  });

  it('ignora campos no numéricos o ausentes', () => {
    const result = findImplausibleNutrients({ 'energy-kcal_100g': 'mucho', proteins_100g: null });
    expect(result).toHaveLength(0);
  });

  it('devuelve array vacío para nutriments null/undefined', () => {
    expect(findImplausibleNutrients(null)).toHaveLength(0);
    expect(findImplausibleNutrients(undefined)).toHaveLength(0);
  });

  it('marca múltiples campos implausibles a la vez', () => {
    const result = findImplausibleNutrients({ 'energy-kcal_100g': 1300, carbohydrates_100g: 817 });
    expect(result).toEqual([
      { field: 'energy-kcal_100g', value: 1300 },
      { field: 'carbohydrates_100g', value: 817 },
    ]);
  });
});
