import { describe, expect, it } from 'vitest';
import { isComplete } from './completeness';

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
});
