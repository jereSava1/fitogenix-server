/* T-02 · respuesta completa de `mapRawToProduct` (docs/05-plan.md).
 * Estaba al final de services/productLookupService.test.ts; se mudó en M-05
 * junto con la función, sin cambios (el snapshot conserva sus claves).
 */
import { describe, expect, it } from 'vitest';
import { mapRawToProduct } from './productResponse';
import type { RawOFFProduct } from '../../../types/fitogenix';

/* T-02 · Caracterización de la respuesta completa (docs/05-plan.md).
 *
 * Snapshot de `mapRawToProduct` para 10 productos de
 * `modules/scoring/domain/regression.test.ts` (copiados tal cual: ese archivo
 * no exporta sus goldens). Cubre las cuatro bandas y los dos lados del corte
 * de `flagged` (< 40): Mayonesa 38 y Nutella 28 salen marcadas, Coca-Cola Zero
 * 47 no. Cualquier cambio en un campo de la respuesta aparece en el diff del
 * snapshot, que se revisa y se actualiza a propósito (`vitest -u`) en el PR
 * del ítem que lo cambia.
 */
describe('caracterización — respuesta completa de mapRawToProduct (T-02)', () => {
  const PRODUCTOS: ReadonlyArray<[string, RawOFFProduct]> = [
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
    expect(mapRawToProduct(raw, '7790000000000')).toMatchSnapshot();
  });
});
