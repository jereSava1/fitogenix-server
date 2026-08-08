import { describe, expect, it } from 'vitest';
import { mergeRawProducts, primarySourceOf } from './merge';

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
