import { describe, expect, it } from 'vitest';
import { extractNutrition } from './productData';

describe('formato del sodio y el colesterol', () => {
  it('el sodio sale en mg enteros, convirtiendo antes de redondear', () => {
    expect(extractNutrition({ sodium_100g: 0.3624 }).sodium).toBe(362);
    expect(extractNutrition({ sodium_100g: 0.0465 }).sodium).toBe(47);
    expect(extractNutrition({ sodium_100g: 0.0004 }).sodium).toBe(0);
  });

  it('el colesterol conserva un decimal', () => {
    expect(extractNutrition({ cholesterol_100g: 0.01234 }).cholesterol).toBe(12.3);
  });

  it('el resto de los nutrientes sigue con un decimal', () => {
    expect(extractNutrition({ proteins_100g: 9.333333 }).protein).toBe(9.3);
  });
});

describe('conversión nutricional para presentación', () => {
  it.each([
    ['sodium', 0.046, 46],
    ['sodium', 0.362, 362],
    ['sodium', 0.664, 664],
    ['sodium', 0.2, 200],
    ['sodium', 0.005, 5],
    ['sodium', 0.04, 40],
    ['cholesterol', 0.0022, 2.2],
    ['cholesterol', 0.0001, 0.1],
  ] as const)('%s: %s g se presenta como %s mg', (key, grams, milligrams) => {
    expect(extractNutrition({ [`${key}_100g`]: grams })[key]).toBe(milligrams);
    expect(extractNutrition({ [`${key}_100g`]: String(grams) })[key]).toBe(milligrams);
  });

  it('mantiene cero declarado, ausencia y prioridad de _100g', () => {
    expect(extractNutrition({ sodium_100g: 0, sodium: 0.362 }).sodium).toBe(0);
    expect(extractNutrition({}).sodium).toBeNull();
    expect(extractNutrition().cholesterol).toBeNull();
    expect(extractNutrition({ sodium: 0.046 }).sodium).toBe(46);
  });

  it.each(['', '   ', 'sin dato', NaN, Infinity, -Infinity, Number.MAX_VALUE, null, true, [], {}])(
    'no presenta un número inválido: %j', (raw) => {
      const result = extractNutrition({ sodium_100g: raw, cholesterol_100g: raw, proteins_100g: raw });
      expect(result).toMatchObject({ sodium: null, cholesterol: null, protein: null });
    },
  );

  it('conserva el redondeo habitual de los demás nutrientes y no modifica el crudo', () => {
    const nutriments = Object.freeze({
      'energy-kcal_100g': 181.24,
      proteins_100g: 15.24,
      carbohydrates_100g: 13.26,
      fat_100g: 7.62,
      sodium_100g: 0.362,
    });
    expect(extractNutrition(nutriments)).toMatchObject({
      calories: 181.2, protein: 15.2, carbs: 13.3, fats: 7.6, sodium: 362,
    });
    expect(nutriments.sodium_100g).toBe(0.362);
  });
});
