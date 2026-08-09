import { describe, expect, it } from 'vitest';
import { mergeRawProducts, primarySourceOf } from './merge';
import type { RawOFFProduct } from '../../../src/types/fitogenix';

describe('mergeRawProducts', () => {
  it('prioriza OFF sobre un scraper de retailer para campos que ambos traen', () => {
    const result = mergeRawProducts([
      { source: 'carrefour', raw: { product_name: 'Nombre Carrefour', brands: 'Marca X' } },
      { source: 'off', raw: { product_name: 'Nombre OFF', ingredients_text: 'agua, sal' } },
    ]);
    expect(result.product_name).toBe('Nombre OFF');
    expect(result.ingredients_text).toBe('agua, sal');
  });

  it('completa campo a campo: toma la imagen del scraper si OFF no la trae', () => {
    const result = mergeRawProducts([
      { source: 'off', raw: { product_name: 'Producto', ingredients_text: 'agua' } },
      { source: 'jumbo', raw: { image_url: 'https://img.example/x.jpg' } },
    ]);
    expect(result.product_name).toBe('Producto');
    expect(result.image_url).toBe('https://img.example/x.jpg');
  });

  it('nutriments es un bloque atómico de una sola fuente, no se mezcla campo a campo', () => {
    const result = mergeRawProducts([
      { source: 'off', raw: { nutriments: { 'energy-kcal_100g': 100, 'proteins_100g': 5 } } },
      { source: 'edamam', raw: { nutriments: { 'sugars_100g': 20 } } },
    ]);
    // gana OFF completo, no una mezcla de energy de OFF + sugars de Edamam
    expect(result.nutriments).toEqual({ 'energy-kcal_100g': 100, 'proteins_100g': 5 });
  });

  it('_aiSource es true solo si TODAS las fuentes eran IA', () => {
    const mixedResult = mergeRawProducts([
      { source: 'ai', raw: { product_name: 'x', _aiSource: true } },
      { source: 'carrefour', raw: { image_url: 'y' } },
    ]);
    expect(mixedResult._aiSource).toBe(false);

    const pureAiResult = mergeRawProducts([
      { source: 'ai', raw: { product_name: 'x', _aiSource: true } },
    ]);
    expect(pureAiResult._aiSource).toBe(true);
  });
});

describe('primarySourceOf', () => {
  it('devuelve la fuente de mayor prioridad entre las que contribuyeron', () => {
    expect(
      primarySourceOf([
        { source: 'jumbo', raw: {} },
        { source: 'off', raw: {} },
      ]),
    ).toBe('off');
  });

  it('devuelve "off" por defecto si no hay entradas', () => {
    expect(primarySourceOf([])).toBe('off');
  });
});

// ── Calidad del valor, no solo "no vacío" ──
// El merge elegía el primer valor NO VACÍO por prioridad de fuente, y OFF
// tiene la prioridad más alta. Un `product_name` que era el propio código de
// barras le ganaba al nombre real del retailer: de ahí salían los productos
// con el barcode en el nombre y la marca vacía, con el dato bueno disponible
// en otra fila.
describe('el merge descarta valores de relleno', () => {
  const off = (raw: Partial<RawOFFProduct>) => ({ source: 'off', raw: raw as RawOFFProduct });
  const jumbo = (raw: Partial<RawOFFProduct>) => ({ source: 'jumbo', raw: raw as RawOFFProduct });

  it('el código de barras no se acepta como nombre', () => {
    const r = mergeRawProducts(
      [off({ product_name: '7790742104205' }), jumbo({ product_name: 'Dulce de Leche Colonial' })],
      '7790742104205',
    );
    expect(r.product_name).toBe('Dulce de Leche Colonial');
  });

  it('una tira de dígitos tampoco, aunque no sea el barcode', () => {
    const r = mergeRawProducts(
      [off({ product_name: '00001017' }), jumbo({ product_name: 'Yerba Mate Taragüí' })],
      '7790387110159',
    );
    expect(r.product_name).toBe('Yerba Mate Taragüí');
  });

  it('el string "null" no se acepta como marca', () => {
    const r = mergeRawProducts([off({ brands: 'null' }), jumbo({ brands: 'La Serenísima' })]);
    expect(r.brands).toBe('La Serenísima');
  });

  it('una imagen que no es una URL no se acepta', () => {
    const r = mergeRawProducts([
      off({ image_url: 'sin-imagen' }),
      jumbo({ image_url: 'https://jumbo.com.ar/foto.jpg' }),
    ]);
    expect(r.image_url).toBe('https://jumbo.com.ar/foto.jpg');
  });

  it('un texto de ingredientes demasiado corto no se acepta', () => {
    const r = mergeRawProducts([
      off({ ingredients_text: 'n/d' }),
      jumbo({ ingredients_text: 'harina de trigo, azúcar, sal' }),
    ]);
    expect(r.ingredients_text).toBe('harina de trigo, azúcar, sal');
  });

  it('si ninguna fuente tiene algo utilizable, queda undefined', () => {
    const r = mergeRawProducts([off({ product_name: '123456789' })], '123456789');
    expect(r.product_name).toBeUndefined();
  });
});

// ── Prioridad por campo ──
describe('la imagen la gana el retailer, el resto lo gana OFF', () => {
  const off = { source: 'off', raw: {
    product_name: 'Nombre OFF', ingredients_text: 'ingredientes de off, curados',
    image_url: 'https://images.openfoodfacts.org/foto-de-celular.jpg',
  } as RawOFFProduct };
  const jumbo = { source: 'jumbo', raw: {
    product_name: 'Nombre Jumbo', ingredients_text: 'ingredientes de jumbo',
    image_url: 'https://jumbo.com.ar/producto.jpg',
  } as RawOFFProduct };

  it('la imagen sale del retailer: fotografía de producto, no foto de usuario', () => {
    expect(mergeRawProducts([off, jumbo]).image_url).toBe('https://jumbo.com.ar/producto.jpg');
  });

  it('los ingredientes siguen saliendo de OFF, que los tiene curados', () => {
    expect(mergeRawProducts([off, jumbo]).ingredients_text).toBe('ingredientes de off, curados');
  });

  it('el nombre sigue saliendo de OFF cuando es utilizable', () => {
    expect(mergeRawProducts([off, jumbo]).product_name).toBe('Nombre OFF');
  });
});

// ── El merge suma, nunca resta ──
// `buildCachePayload` escribe null explícito en cada campo faltante y el
// merge hace upsert con eso. Si el producto ya existía con datos que no están
// en staging —llegaron por un escaneo en vivo, por el enriquecimiento por EAN
// o por la API de OFF—, la corrida los borraba. Por eso la fila existente
// entra al merge como una fuente más, de prioridad mínima.
describe('la fila existente en products participa del merge', () => {
  const existing = (raw: Partial<RawOFFProduct>) => ({ source: 'existing', raw: raw as RawOFFProduct });
  const jumbo = (raw: Partial<RawOFFProduct>) => ({ source: 'jumbo', raw: raw as RawOFFProduct });
  const off = (raw: Partial<RawOFFProduct>) => ({ source: 'off', raw: raw as RawOFFProduct });

  it('conserva los ingredientes que ya teníamos cuando staging no los trae', () => {
    const r = mergeRawProducts([
      jumbo({ product_name: 'Agua Mineral Villavicencio', image_url: 'https://jumbo/f.jpg' }),
      existing({ ingredients_text: 'agua mineral natural' }),
    ]);
    expect(r.ingredients_text).toBe('agua mineral natural');
    expect(r.product_name).toBe('Agua Mineral Villavicencio');
  });

  it('conserva la imagen que ya teníamos', () => {
    const r = mergeRawProducts([
      off({ product_name: 'Producto', ingredients_text: 'harina, sal' }),
      existing({ image_url: 'https://images.openfoodfacts.org/traida-por-api.jpg' }),
    ]);
    expect(r.image_url).toBe('https://images.openfoodfacts.org/traida-por-api.jpg');
  });

  it('pero cede ante cualquier fuente fresca: llena huecos, no pisa', () => {
    const r = mergeRawProducts([
      jumbo({ ingredients_text: 'ingredientes frescos del retailer' }),
      existing({ ingredients_text: 'ingredientes viejos' }),
    ]);
    expect(r.ingredients_text).toBe('ingredientes frescos del retailer');
  });

  it('no resucita un valor de relleno guardado antes', () => {
    // Si lo que quedó guardado era el barcode como nombre, sigue sin servir.
    const r = mergeRawProducts(
      [jumbo({ image_url: 'https://jumbo/f.jpg' }), existing({ product_name: '7790742104205' })],
      '7790742104205',
    );
    expect(r.product_name).toBeUndefined();
  });

  it('no cambia la fuente reportada del producto', () => {
    expect(primarySourceOf([
      { source: 'existing', raw: {} as RawOFFProduct },
      { source: 'jumbo', raw: {} as RawOFFProduct },
    ])).toBe('jumbo');
  });
});
