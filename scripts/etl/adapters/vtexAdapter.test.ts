import { describe, expect, it } from 'vitest';
import { adaptVtexProduct } from './vtexAdapter';

describe('adaptVtexProduct', () => {
  it('adapta un producto envasado con EAN real a un RawOFFProduct', () => {
    const results = adaptVtexProduct({
      productName: 'Fideos Tallarín al Huevo 500 Grs',
      brand: 'Don Vicente',
      categories: ['/Almacén/Pastas y Tapas/Fideos y Ñoquis/'],
      items: [
        { itemId: 'sku1', ean: '7790070714018', images: [{ imageUrl: 'https://img.example/x.jpg' }] },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0].barcode).toBe('7790070714018');
    expect(results[0].raw.product_name).toBe('Fideos Tallarín al Huevo 500 Grs');
    expect(results[0].raw.brands).toBe('Don Vicente');
    expect(results[0].raw.image_url).toBe('https://img.example/x.jpg');
    expect(results[0].raw.categories).toBe('Almacén > Pastas y Tapas > Fideos y Ñoquis');
    // nunca trae datos nutricionales — el retailer no los tiene
    expect(results[0].raw.ingredients_text).toBeUndefined();
    expect(results[0].raw.nutriments).toBeUndefined();
  });

  it('descarta items con código interno de balanza/PLU (prefijo 2, 13 dígitos)', () => {
    const results = adaptVtexProduct({
      productName: 'Cebolla Superior Por Kg',
      brand: 'VERDULERIA PROPIA',
      items: [{ itemId: 'sku2', ean: '2596536000006' }],
    });
    expect(results).toHaveLength(0);
  });

  it('descarta items sin ean', () => {
    const results = adaptVtexProduct({ productName: 'x', items: [{ itemId: 'sku3' }] });
    expect(results).toHaveLength(0);
  });

  it('devuelve un resultado por cada SKU válido cuando hay varias presentaciones', () => {
    const results = adaptVtexProduct({
      productName: 'Yerba Mate',
      brand: 'Playadito',
      items: [
        { itemId: 'sku4', ean: '7790580123456' },
        { itemId: 'sku5', ean: '7790580654321' },
      ],
    });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.barcode)).toEqual(['7790580123456', '7790580654321']);
  });

  it('devuelve array vacío si no hay items', () => {
    expect(adaptVtexProduct({ productName: 'x' })).toHaveLength(0);
  });

  it('normaliza un EAN de 12 dígitos (UPC-A) a EAN-13 con 0 adelante', () => {
    const results = adaptVtexProduct({
      productName: 'Producto importado',
      items: [{ itemId: 'sku6', ean: '012345678905' }],
    });
    expect(results).toHaveLength(1);
    expect(results[0].barcode).toBe('0012345678905');
  });
});
