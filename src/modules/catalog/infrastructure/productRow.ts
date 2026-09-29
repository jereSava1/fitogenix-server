/* Fila de `products` → `RawOFFProduct` reconstruido (función pura, sin I/O).
 *
 * Adaptador de la tabla `products`: lo comparten el lector del catálogo
 * (`supabaseProductReader.ts`) y los listados de guardados e historial
 * (`services/productRowMapper.ts`). Antes vivía en `services/cacheService.ts`;
 * se mudó en M-04 sin cambios.
 */

import type { RawOFFProduct } from '../../../types/fitogenix';
import type { CachedProductRow } from '../application/ports';

// Type guards mínimos para leer columnas jsonb sin `any`.
function asStringRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
}

/**
 * Reconstruye el RawOFFProduct crudo desde una fila de `products` (función PURA,
 * sin I/O). Compartida entre las lecturas del catálogo (supabaseProductReader) y
 * productRowMapper (listados de guardados/historial con productos embebidos
 * vía PostgREST) para que todos apliquen EXACTAMENTE el mismo mapeo.
 *
 * Filas sin `id` o sin datos crudos devuelven null: se tratan como cache miss /
 * se omiten de listados. Un `nutriments` VACÍO ({}) cuenta como AUSENTE — una
 * fila con `{}` y sin ingredients_text no alcanza para recomputar un score con
 * sentido, así que también es miss (se recachea con datos frescos).
 */
export function rowToCachedRaw(data: Record<string, unknown>): CachedProductRow | null {
  // Sin id no hay identidad: la fila no sirve para el payload ni para FKs.
  const productId = typeof data.id === 'string' ? data.id : null;
  if (!productId) return null;

  const ingredientsText =
    typeof data.ingredients_text === 'string' ? data.ingredients_text : undefined;
  const nutriments = asStringRecord(data.nutriments);
  const hasNutriments = nutriments !== undefined && Object.keys(nutriments).length > 0;

  // Fila sin datos crudos (o con nutriments vacío) → tratar como miss.
  if (!ingredientsText && !hasNutriments) return null;

  const raw: RawOFFProduct = {
    product_name: typeof data.product_name === 'string' ? data.product_name : undefined,
    brands: typeof data.brand === 'string' ? data.brand : undefined,
    image_url: typeof data.image_url === 'string' ? data.image_url : undefined,
    ingredients_text: ingredientsText,
    nutriments,
    nova_group: typeof data.nova_group === 'number' ? data.nova_group : undefined,
    additives_tags: asStringArray(data.additives_tags),
    categories: typeof data.category === 'string' ? data.category : undefined,
    _aiEnriched: data.ai_enriched === true,
    _aiSource: data.data_source === 'ai',
  };

  return {
    raw,
    dataSource: typeof data.data_source === 'string' ? data.data_source : 'off',
    productId,
    barcode: typeof data.barcode === 'string' ? data.barcode : null,
    nameKey: typeof data.name_key === 'string' ? data.name_key : null,
  };
}
