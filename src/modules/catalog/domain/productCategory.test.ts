import { describe, expect, it } from 'vitest';
import { extractCategory } from './productData';

describe('categorías legibles con letras Unicode', () => {
  it.each([
    ['Lácteos', 'Lácteos'],
    ['lácteos', 'Lácteos'],
    ['Almacén > Sal', 'Almacén > Sal'],
    ['Almacén > Mesa Dulce Navideña', 'Almacén > Mesa Dulce Navideña'],
    ['ácidos', 'Ácidos'],
    ['sándwiches', 'Sándwiches'],
    ['en:aliments-d’origine-végétale', 'Aliments D’Origine Végétale'],
    ['la\u0301cteos', 'La\u0301cteos'],
  ])('%s → %s', (raw, expected) => {
    expect(extractCategory(raw)).toBe(expected);
  });

  it('conserva selección, prefijos, guiones y siglas existentes', () => {
    expect(extractCategory('en:sweet-snacks,en:chocolate-covered-sweet-biscuits')).toBe('Sweet Snacks');
    expect(extractCategory('Bebidas SIN TACC')).toBe('Bebidas SIN TACC');
    expect(extractCategory('Almacén > Desayuno y Merienda > Galletitas Dulces'))
      .toBe('Almacén > Desayuno y Merienda > Galletitas Dulces');
    expect(extractCategory()).toBe('Alimento');
  });
});
