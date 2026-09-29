/* M-04 · normalizeQuery (antes services/queryNormalization.ts, sin test propio).
 * Fija su comportamiento actual antes de que H-04 la vuelva la única
 * normalización (hoy el cache Redis usa otra, que solo pasa a minúsculas y
 * recorta).
 */
import { describe, expect, it } from 'vitest';
import { normalizeQuery } from './query';

describe('normalizeQuery', () => {
  it('pasa a minúsculas, quita acentos y colapsa espacios', () => {
    expect(normalizeQuery('  Café   con LECHE ')).toBe('cafe con leche');
  });

  it('quita diacríticos: la ñ pasa a n y la ü a u', () => {
    expect(normalizeQuery('Ñandú Pingüino')).toBe('nandu pinguino');
  });

  it('tabs y saltos de línea cuentan como espacio', () => {
    expect(normalizeQuery('galletitas\t de\n agua')).toBe('galletitas de agua');
  });

  it('no toca la puntuación', () => {
    expect(normalizeQuery('Coca-Cola 2,25 L')).toBe('coca-cola 2,25 l');
  });

  it('vacío o solo espacios → cadena vacía', () => {
    expect(normalizeQuery('')).toBe('');
    expect(normalizeQuery('   ')).toBe('');
  });
});
