import { describe, expect, it } from 'vitest';
import { presentCategory } from './preview-product-categories';

describe('prototipo de categorías para pantalla, sin perder el original', () => {
  it.each([
    ['Almacén > Sal', 'Sal'],
    ['Lácteos > Yogures > Yogures descremados', 'Yogures Descremados'],
    ['Almacén > Mesa Dulce Navideña', 'Mesa Dulce Navideña'],
    ['sándwiches', 'Sándwiches'],
    ['en:sweet-snacks', 'Sweet Snacks'],
    ['  > Almacén > Sal > ', 'Sal'],
    ['Lácteos, Yogures', 'Lácteos'],
    ['', 'Alimento'],
  ])('%s: solo la etiqueta %s', (raw, label) => {
    const product = Object.freeze({ categories: raw });
    expect(presentCategory(product.categories)).toEqual({ label });
    expect(product.categories).toBe(raw);
  });

  it('preserva siglas y no supone jerarquías para listas planas', () => {
    expect(presentCategory('Bebidas SIN TACC')).toEqual({ label: 'Bebidas SIN TACC' });
    expect(presentCategory(undefined)).toEqual({ label: 'Alimento' });
  });
});
