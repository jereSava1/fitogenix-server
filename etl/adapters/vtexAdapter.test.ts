import { describe, expect, it } from 'vitest';
import { adaptVtexProduct, parseVtexIngredients, parseVtexNutrition, parseVtexSeals } from './vtexAdapter';

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

// ── Cencosud (Jumbo/Disco/Vea) publica ingredientes y tabla nutricional ──
// La versión anterior del adapter daba por sentado que "un retailer nunca
// trae ingredientes". Es cierto para Carrefour, falso para Cencosud — y por
// esa suposición estábamos descartando datos reales.
describe('campos nutricionales de Cencosud', () => {
  it('normaliza la lista de ingredientes del repr de Python al formato de OFF', () => {
    expect(parseVtexIngredients(["'harina de trigo 0000', 'manteca', 'azúcar'"]))
      .toBe('harina de trigo 0000, manteca, azúcar');
  });

  it('devuelve undefined cuando el campo no viene o está vacío', () => {
    expect(parseVtexIngredients(undefined)).toBeUndefined();
    expect(parseVtexIngredients([''])).toBeUndefined();
  });

  it('mapea la tabla nutricional a las claves _100g de OFF', () => {
    const tabla = [
      "{'basic_unit_name': 'g', 'energy_value': 416.67, 'protein_value': 3, " +
      "'fat_total_value': 22.67, 'fat_sat_value': 11, 'fat_trans_value': 0, " +
      "'sugars_value': 30, 'fiber_value': 1, 'sodium_value': 296.67}",
    ];
    expect(parseVtexNutrition(tabla)).toEqual({
      'energy-kcal_100g': 416.67,
      'proteins_100g': 3,
      'fat_100g': 22.67,
      'saturated-fat_100g': 11,
      'trans-fat_100g': 0,
      'sugars_100g': 30,
      'fiber_100g': 1,
      // El sodio viene en mg y OFF lo expresa en gramos — el motor lo
      // reconvierte a mg, así que equivocarse acá desplaza el umbral x1000.
      'sodium_100g': 0.29667,
    });
  });

  it('ignora los valores por porción y se queda con los de por 100', () => {
    const tabla = ["{'sugars_value': 30, 'sugars_value_per_portion': 9}"];
    expect(parseVtexNutrition(tabla)).toEqual({ 'sugars_100g': 30 });
  });

  it('extrae los códigos de certificación como labels', () => {
    const sellos = [
      "[{'certification_type_code': 'lactose_free'}, {'certification_type_code': 'vegan'}]",
    ];
    expect(parseVtexSeals(sellos)).toEqual(['vtex:lactose_free', 'vtex:vegan']);
  });

  it('un producto de Cencosud llega con ingredientes y nutrientes', () => {
    const [adapted] = adaptVtexProduct({
      productName: 'Palmeritas',
      brand: 'Marca',
      items: [{ ean: '7790000000017', images: [{ imageUrl: 'x' }] }],
      Ingredientes: ["'harina de trigo', 'manteca'"],
      'Tabla Nutricional': ["{'sugars_value': 30, 'sodium_value': 300}"],
    } as Parameters<typeof adaptVtexProduct>[0]);

    expect(adapted.raw.ingredients_text).toBe('harina de trigo, manteca');
    expect(adapted.raw.nutriments).toMatchObject({ 'sugars_100g': 30, 'sodium_100g': 0.3 });
  });
});
