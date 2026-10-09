import { describe, expect, it } from 'vitest';
import { findImplausibleNutrients, findNutrientInconsistencies } from './nutrientPlausibility';

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

describe('findImplausibleNutrients con trans-fat, colesterol y números como texto', () => {
  it('marca grasas trans y colesterol fuera de rango', () => {
    const result = findImplausibleNutrients({ 'trans-fat_100g': 120, cholesterol_100g: 101 });
    expect(result.map((r) => r.field)).toEqual(['trans-fat_100g', 'cholesterol_100g']);
  });

  it('lee un número guardado como texto y marca un valor negativo', () => {
    expect(findImplausibleNutrients({ proteins_100g: '150' })).toEqual([{ field: 'proteins_100g', value: 150 }]);
    expect(findImplausibleNutrients({ fat_100g: -2 })).toEqual([{ field: 'fat_100g', value: -2 }]);
  });
});

describe('findNutrientInconsistencies', () => {
  it('no marca una tabla coherente', () => {
    expect(
      findNutrientInconsistencies({
        carbohydrates_100g: 60, sugars_100g: 20, fat_100g: 10, 'saturated-fat_100g': 4, proteins_100g: 8,
      }),
    ).toEqual([]);
  });

  it('marca azúcares mayores que carbohidratos', () => {
    const [issue] = findNutrientInconsistencies({ carbohydrates_100g: 10, sugars_100g: 12 });
    expect(issue).toMatchObject({ rule: 'azucares_mayor_que_carbohidratos', values: [12, 10] });
  });

  it('tolera 0,1 g de redondeo', () => {
    expect(findNutrientInconsistencies({ carbohydrates_100g: 10, sugars_100g: 10.1 })).toEqual([]);
  });

  it('marca saturadas o trans mayores que las grasas', () => {
    const rules = findNutrientInconsistencies({ fat_100g: 5, 'saturated-fat_100g': 7, 'trans-fat_100g': 6 }).map(
      (i) => i.rule,
    );
    expect(rules).toEqual(['saturadas_mayor_que_grasas', 'trans_mayor_que_grasas']);
  });

  it('marca macros que suman más de 100 g, con 1 g de tolerancia', () => {
    expect(findNutrientInconsistencies({ proteins_100g: 40, carbohydrates_100g: 50, fat_100g: 20 })[0].rule).toBe(
      'macros_suman_mas_de_100',
    );
    expect(findNutrientInconsistencies({ proteins_100g: 40, carbohydrates_100g: 40, fat_100g: 20.5 })).toEqual([]);
  });

  it('no evalúa pares con un dato ausente', () => {
    expect(findNutrientInconsistencies({ sugars_100g: 50 })).toEqual([]);
    expect(findNutrientInconsistencies(null)).toEqual([]);
  });
});
