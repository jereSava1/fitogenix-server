import { describe, expect, it } from 'vitest';
import { adaptOffLine } from './offAdapter';

describe('adaptOffLine', () => {
  it('adapta un producto argentino completo', () => {
    const result = adaptOffLine({
      code: '7790895000013',
      product_name: 'Alfajor Triple',
      brands: 'Havanna',
      ingredients_text: 'harina de trigo, azúcar, cacao',
      nutriments: { 'energy-kcal_100g': 450 },
      countries_tags: ['en:argentina'],
    });
    expect(result).not.toBeNull();
    expect(result?.barcode).toBe('7790895000013');
    expect(result?.raw.product_name).toBe('Alfajor Triple');
  });

  it('por default (sin countryTags) NO acepta un producto tageado solo Chile', () => {
    const result = adaptOffLine({
      code: '7801234567890',
      product_name: 'Producto Chileno',
      ingredients_text: 'agua, sal',
      countries_tags: ['en:chile'],
    });
    expect(result).toBeNull();
  });

  it('acepta otros países LATAM si se piden explícitamente vía countryTags', () => {
    const result = adaptOffLine(
      {
        code: '7801234567890',
        product_name: 'Producto Chileno',
        ingredients_text: 'agua, sal',
        countries_tags: ['en:chile'],
      },
      ['en:chile'],
    );
    expect(result).not.toBeNull();
  });

  it('descarta productos fuera de los países activos', () => {
    const result = adaptOffLine({
      code: '1234567890123',
      product_name: 'Something',
      ingredients_text: 'water',
      countries_tags: ['en:germany'],
    });
    expect(result).toBeNull();
  });

  it('descarta filas sin barcode válido', () => {
    expect(adaptOffLine({ product_name: 'x', countries_tags: ['en:argentina'] })).toBeNull();
  });

  it('descarta filas sin ingredients_text ni nutriments (nada que aportar)', () => {
    const result = adaptOffLine({
      code: '7790895000013',
      product_name: 'Producto vacío',
      countries_tags: ['en:argentina'],
    });
    expect(result).toBeNull();
  });

  it('acepta un producto con prefijo GS1 779 (Argentina) aunque no tenga countries_tags', () => {
    const result = adaptOffLine({
      code: '7790895000013',
      product_name: 'Producto sin tag de país',
      ingredients_text: 'harina, sal',
      // countries_tags ausente a propósito — mal tageado en OFF, pasa igual.
    });
    expect(result).not.toBeNull();
  });

  it('normaliza un código UPC-A (12 dígitos) a EAN-13 con 0 adelante', () => {
    const result = adaptOffLine({
      code: '012345678905',
      product_name: 'Producto importado',
      ingredients_text: 'agua',
      countries_tags: ['en:argentina'],
    });
    expect(result?.barcode).toBe('0012345678905');
  });
});
