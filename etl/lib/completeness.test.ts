import { describe, expect, it } from 'vitest';
import { hasNutrientData, isComplete } from './completeness';

describe('isComplete', () => {
  it('completo con ingredients_text', () => {
    expect(isComplete({ ingredients_text: 'agua, sal' })).toBe(true);
  });

  it('completo con nutriments no vacío', () => {
    expect(isComplete({ nutriments: { 'energy-kcal_100g': 100 } })).toBe(true);
  });

  it('incompleto sin ninguno de los dos', () => {
    expect(isComplete({ product_name: 'Solo nombre, sin datos' })).toBe(false);
  });

  it('incompleto con ingredients_text vacío y nutriments {}', () => {
    expect(isComplete({ ingredients_text: '  ', nutriments: {} })).toBe(false);
  });

  it('incompleto si nutriments solo trae claves que no son nutrientes', () => {
    expect(isComplete({ nutriments: { 'nova-group': 4 } })).toBe(false);
  });
});

describe('hasNutrientData', () => {
  it('cuenta un nutriente numérico, con o sin sufijo _100g', () => {
    expect(hasNutrientData({ sodium_100g: 0 })).toBe(true);
    expect(hasNutrientData({ proteins: '3,5' })).toBe(false);
    expect(hasNutrientData({ proteins: '3.5' })).toBe(true);
  });

  it('no cuenta ausentes, vacíos ni no finitos', () => {
    expect(hasNutrientData(undefined)).toBe(false);
    expect(hasNutrientData({})).toBe(false);
    expect(hasNutrientData({ sugars_100g: '' })).toBe(false);
    expect(hasNutrientData({ fat_100g: Number.NaN })).toBe(false);
    expect(hasNutrientData({ 'nova-group': 4, 'nutriscore-score': 10 })).toBe(false);
  });
});
