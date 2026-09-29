import type { RawProduct } from '../../src/modules/catalog';

/** Gate de completitud, el mismo criterio que `rowToCachedRaw`: sin `ingredients_text` ni
 *  `nutriments` con contenido no se puede recalcular un puntaje. */
export function isComplete(raw: RawProduct): boolean {
  const hasIngredients =
    typeof raw.ingredients_text === 'string' && raw.ingredients_text.trim().length > 0;
  const hasNutriments = raw.nutriments != null && Object.keys(raw.nutriments).length > 0;
  return hasIngredients || hasNutriments;
}
