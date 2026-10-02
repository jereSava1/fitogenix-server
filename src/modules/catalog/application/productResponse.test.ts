import { describe, expect, it } from 'vitest';
import { toProductDetail, toProductSummary } from './productResponse';
import type { RawProduct } from '../domain/rawProduct';

// Snapshot de la respuesta para 10 goldens del motor: cubre las cuatro bandas y los dos
// lados del corte de `highlight`. Un cambio de campo aparece en el diff del snapshot.
const IDENTIDAD = { id: '6f1e2c3d-0000-4000-8000-000000000001', fallbackName: '7790000000000' };

describe('caracterización — respuesta completa de toProductDetail (T-02)', () => {
  const PRODUCTOS: ReadonlyArray<[string, RawProduct]> = [
    ['Coca-Cola', {
      product_name: 'Coca-Cola', categories: 'Bebidas, Gaseosas',
      ingredients_text: 'agua carbonatada, azúcar, colorante caramelo E150d, acidulante ácido fosfórico, aromas naturales, cafeína',
      nutriments: { 'sugars_100g': 10.6, 'energy-kcal_100g': 42, 'sodium_100g': 0.005 },
    }],
    ['Coca-Cola Zero', {
      product_name: 'Coca-Cola Zero', categories: 'Bebidas, Gaseosas',
      ingredients_text: 'agua carbonatada, colorante caramelo E150d, acidulante ácido fosfórico, edulcorantes aspartamo y acesulfame K, aromas, cafeína',
      nutriments: { 'sugars_100g': 0, 'energy-kcal_100g': 1 },
    }],
    ['Galletitas tipo Oreo', {
      product_name: 'Galletitas de chocolate rellenas',
      ingredients_text: 'harina de trigo, azúcar, aceite vegetal, cacao alcalinizado, jarabe de glucosa, leudantes, sal, emulsionante lecitina de soja, saborizante',
      nutriments: { 'sugars_100g': 38, 'saturated-fat_100g': 9, 'energy-kcal_100g': 480, 'sodium_100g': 0.4 },
    }],
    ['Yogur natural entero', {
      product_name: 'Yogur natural', categories: 'Lácteos, Yogures',
      ingredients_text: 'leche parcialmente descremada, fermentos lácticos',
      nutriments: { 'sugars_100g': 4.7, 'energy-kcal_100g': 45 },
    }],
    ['Leche entera', {
      product_name: 'Leche entera', categories: 'Lácteos',
      ingredients_text: 'leche entera',
      nutriments: { 'sugars_100g': 4.6, 'saturated-fat_100g': 2, 'energy-kcal_100g': 61, 'fat_100g': 3.2 },
    }],
    ['Jamón cocido con ascorbato', {
      product_name: 'Jamón cocido', categories: 'Fiambres',
      ingredients_text: 'carne de cerdo, agua, sal, azúcar, estabilizantes, ascorbato de sodio, nitrito de sodio',
    }],
    ['Mayonesa', {
      product_name: 'Mayonesa',
      ingredients_text: 'aceite de girasol, agua, yema de huevo, vinagre, azúcar, sal, jugo de limón, conservante',
      nutriments: { 'fat_100g': 45, 'saturated-fat_100g': 5, 'energy-kcal_100g': 420, 'sodium_100g': 0.8 },
    }],
    ['Barrita de cereal', {
      product_name: 'Barrita de cereal',
      ingredients_text: 'avena, jarabe de glucosa, azúcar, aceite de girasol, miel, saborizante, emulsionante',
    }],
    ['Papas fritas de paquete', {
      product_name: 'Papas fritas',
      ingredients_text: 'papa, aceite de girasol alto oleico, sal',
      nutriments: { 'fat_100g': 32, 'saturated-fat_100g': 3, 'sodium_100g': 0.6, 'energy-kcal_100g': 530 },
    }],
    ['Nutella (etiqueta en inglés de OFF)', {
      ingredients_text: 'sugar, palm oil, hazelnuts, cocoa, skim milk, reduced minerals whey, lecithin as emulsifier, vanilla',
      nutriments: { 'sugars_100g': 44.2, 'saturated-fat_100g': 9.6, 'energy-kcal_100g': 539, 'sodium_100g': 0.04 },
    }],
  ];

  it.each(PRODUCTOS)('%s', (_label, raw) => {
    expect(toProductDetail(raw, IDENTIDAD)).toMatchSnapshot();
  });

  it.each(PRODUCTOS)('%s: el resumen es exactamente la parte común del detalle (K-04)', (_label, raw) => {
    const detalle = toProductDetail(raw, IDENTIDAD);
    const resumen = toProductSummary(raw, IDENTIDAD);
    expect(Object.keys(resumen)).toEqual(['id', 'name', 'brand', 'imageUrl', 'score', 'scoreLabel', 'scoreColor']);
    for (const [campo, valor] of Object.entries(resumen)) {
      expect(detalle[campo as keyof typeof detalle], campo).toEqual(valor);
    }
  });
});

describe('identidad, nombre, marca e imagen (K-04)', () => {
  const base: RawProduct = { product_name: 'Yogur natural (1 kg)', ingredients_text: 'leche, fermentos' };

  it('los 12 campos del detalle, ni uno más', () => {
    expect(Object.keys(toProductDetail(base, IDENTIDAD)).sort()).toEqual([
      'brand', 'fito', 'highlight', 'id', 'imageUrl', 'ingredients', 'name', 'noScore',
      'nutrition', 'score', 'scoreColor', 'scoreLabel',
    ]);
  });

  it('id es el de la identidad; el nombre se limpia y, si falta, se usa el de reemplazo', () => {
    expect(toProductDetail(base, IDENTIDAD)).toMatchObject({ id: IDENTIDAD.id, name: 'Yogur natural' });
    expect(toProductSummary({ ...base, product_name: undefined }, IDENTIDAD).name).toBe('7790000000000');
  });

  it('brand vacía → null; imageUrl prefiere la foto del frente', () => {
    expect(toProductSummary({ ...base, brands: '' }, IDENTIDAD).brand).toBeNull();
    expect(toProductSummary({ ...base, brands: 'La Serenísima' }, IDENTIDAD).brand).toBe('La Serenísima');
    expect(toProductSummary(base, IDENTIDAD).imageUrl).toBeNull();
    expect(toProductSummary({ ...base, image_url: 'a.jpg' }, IDENTIDAD).imageUrl).toBe('a.jpg');
    expect(toProductSummary({ ...base, image_url: 'a.jpg', image_front_url: 'f.jpg' }, IDENTIDAD).imageUrl).toBe('f.jpg');
  });

  it('cada ingrediente lleva solo nombre, severidad y descripción', () => {
    const { ingredients } = toProductDetail(base, IDENTIDAD);
    expect(ingredients.length).toBeGreaterThan(0);
    for (const ingrediente of ingredients) {
      expect(Object.keys(ingrediente)).toEqual(['name', 'sev', 'desc']);
    }
  });
});
