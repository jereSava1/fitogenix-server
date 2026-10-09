import type { RawProduct } from '../../src/modules/catalog';

// Nutrientes que cuentan como tabla nutricional. Claves como `nova-group` o `nutriscore-score`
// vienen en el mismo objeto pero no son nutrientes.
const NUTRIENT_KEYS = [
  'energy-kcal', 'energy', 'proteins', 'carbohydrates', 'sugars', 'fat', 'saturated-fat',
  'trans-fat', 'fiber', 'sodium', 'salt', 'cholesterol',
] as const;

/** ¿El bloque trae al menos un nutriente con un número real? */
export function hasNutrientData(nutriments: Record<string, unknown> | null | undefined): boolean {
  if (!nutriments) return false;
  return NUTRIENT_KEYS.some((key) => {
    const raw = nutriments[`${key}_100g`] ?? nutriments[key];
    if (typeof raw === 'number') return Number.isFinite(raw);
    return typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw));
  });
}

/** Gate de completitud: sin `ingredients_text` ni nutrientes reales no se puede recalcular un
 *  puntaje. Un `nutriments` con solo `nova-group` no cuenta. */
export function isComplete(raw: RawProduct): boolean {
  const hasIngredients =
    typeof raw.ingredients_text === 'string' && raw.ingredients_text.trim().length > 0;
  return hasIngredients || hasNutrientData(raw.nutriments);
}
