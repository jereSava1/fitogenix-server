// Parseo de lo que traen las fuentes (nutrición, categoría, nombre). No es puntaje.

import type { NutritionFacts } from '../../scoring';

const EMPTY_NUTRITION: NutritionFacts = {
  calories: null, protein: null, carbs: null, sugars: null, fats: null,
  satFats: null, sodium: null, fiber: null, transFat: null, cholesterol: null,
};

/** El panel nutricional crudo → la forma que consume la app. */
export function extractNutrition(nutriments?: Record<string, unknown>): NutritionFacts {
  if (!nutriments) return EMPTY_NUTRITION;

  const read = (key: string, scale = 1, decimals = 1): number | null => {
    const raw = nutriments[`${key}_100g`] ?? nutriments[key];
    if (typeof raw !== 'number' && typeof raw !== 'string') return null;
    if (typeof raw === 'string' && raw.trim() === '') return null;
    const value = Number(raw) * scale;
    if (!Number.isFinite(value)) return null;
    // Convertir antes de redondear: 0,046 g debe conservarse como 46 mg.
    const factor = 10 ** decimals;
    const rounded = Math.round(value * factor) / factor;
    return Number.isFinite(rounded) ? rounded : null;
  };

  return {
    calories: read('energy-kcal'),
    protein: read('proteins'),
    carbs: read('carbohydrates'),
    sugars: read('sugars'),
    fats: read('fat'),
    satFats: read('saturated-fat'),
    sodium: read('sodium', 1000, 0), // mg enteros
    fiber: read('fiber'),
    transFat: read('trans-fat'),
    cholesterol: read('cholesterol', 1000, 1), // mg con un decimal
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
    .replace(/(^|[^\p{L}\p{M}\p{N}_])(\p{L})/gu, (_match, prefix: string, char: string) =>
      prefix + char.toUpperCase(),
    );
}

/** El nombre sin paréntesis, corchetes, códigos de barras ni gramajes; sin nombre, `fallback`. */
export function cleanName(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  return raw
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+\d{8,14}\b/g, '')
    .replace(/\s+\d+\s*(?:g|gr|kg|ml|l|lts?|cc|oz)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}
