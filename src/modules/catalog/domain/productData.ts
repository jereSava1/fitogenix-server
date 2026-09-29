/* Datos crudos de un producto → la forma que consume la app.
 *
 * No son puntaje: parsean lo que traen las fuentes (panel nutricional,
 * categorías). Antes vivían en la fachada del motor (`ftgEngine.ts`); se
 * mudaron acá en M-03 (docs/02-arquitectura.md §5.1 #2).
 */

import type { NutritionFacts } from '../../scoring';

const EMPTY_NUTRITION: NutritionFacts = {
  calories: null, protein: null, carbs: null, sugars: null, fats: null,
  satFats: null, sodium: null, fiber: null, transFat: null, cholesterol: null,
};

/** El panel nutricional crudo → la forma que consume la app. */
export function extractNutrition(nutriments?: Record<string, unknown>): NutritionFacts {
  if (!nutriments) return EMPTY_NUTRITION;

  const read = (key: string): number | null => {
    const raw = nutriments[`${key}_100g`] ?? nutriments[key];
    if (raw == null || Number.isNaN(Number(raw))) return null;
    return Math.round(parseFloat(String(raw)) * 10) / 10;
  };
  const toMilligrams = (value: number | null) => (value != null ? Math.round(value * 1000) : null);

  return {
    calories: read('energy-kcal'),
    protein: read('proteins'),
    carbs: read('carbohydrates'),
    sugars: read('sugars'),
    fats: read('fat'),
    satFats: read('saturated-fat'),
    sodium: toMilligrams(read('sodium')),
    fiber: read('fiber'),
    transFat: read('trans-fat'),
    cholesterol: toMilligrams(read('cholesterol')),
  };
}

/** La categoría más corta y legible de la lista jerárquica que traen las
 *  fuentes ("en:snacks,en:sweet-snacks,..."). */
export function extractCategory(categories?: string): string {
  if (!categories) return 'Alimento';

  const parts = categories.split(',').map((part) => part.trim());
  const shortest = parts.find((part) => part.split(':').pop()!.length < 30);
  if (!shortest) return parts[0] || 'Alimento';

  return shortest
    .split(':')
    .pop()!
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
