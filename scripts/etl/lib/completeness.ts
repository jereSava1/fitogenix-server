import type { RawOFFProduct } from '../../../src/types/fitogenix';

/**
 * Gate de completitud — Fase 3c de 06-agente-etl-data.md. MISMO criterio que
 * `cacheService.rowToCachedRaw` (src/services/cacheService.ts): sin
 * `ingredients_text` NI `nutriments` con contenido real, no alcanza para
 * recomputar un score con sentido. No es un criterio nuevo, es el mismo
 * aplicado antes de escribir a `products` en vez de al leer.
 */
export function isComplete(raw: RawOFFProduct): boolean {
  const hasIngredients =
    typeof raw.ingredients_text === 'string' && raw.ingredients_text.trim().length > 0;
  const hasNutriments = raw.nutriments != null && Object.keys(raw.nutriments).length > 0;
  return hasIngredients || hasNutriments;
}
