/* Fila de `products` → `RawProduct` reconstruido (funciones puras, sin I/O).
 *
 * Adaptador de la tabla `products`: lo comparten el lector del catálogo
 * (`supabaseProductReader.ts`) y los listados de guardados e historial
 * (`productSummaryFromRow`, expuesta en el index del módulo). Antes vivía en
 * `services/cacheService.ts` (M-04); `productSummaryFromRow` era
 * `services/productRowMapper.ts · joinedRowToProduct` (M-05) y hasta K-04
 * armaba el producto completo (`productResponseFromRow`).
 */

import type { RawProduct } from '../domain/rawProduct';
import type { CachedProductRow } from '../application/ports';
import {
  rowFallbackName,
  toProductSummary,
  type ProductSummary,
} from '../application/productResponse';

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
 * Reconstruye el RawProduct crudo desde una fila de `products` (función PURA,
 * sin I/O). Compartida entre las lecturas del catálogo (supabaseProductReader) y
 * productSummaryFromRow (listados de guardados/historial con productos embebidos
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

  const raw: RawProduct = {
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

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * El resumen de un producto desde una fila join { product_id, products }.
 *
 * Tanto saved_products como scan_history referencian `products` vía
 * `product_id` (migración 006) y listan con un embed
 * (`<tabla>(product_id, ..., products(*))`). Esta función concentra la
 * reconstrucción del producto para que ambos listados apliquen EXACTAMENTE el
 * mismo pipeline que un hit de cache: rowToCachedRaw + puntaje recalculado.
 * Desde K-04 los listados llevan el resumen (`ProductSummary`); el detalle se
 * pide con `GET /v1/products/:id`. Sin nombre, se muestra el barcode de la
 * fila (antes, el uuid).
 *
 * Devuelve null si la fila no tiene la forma esperada, si el producto
 * embebido falta (p.ej. purgado entre el join y la lectura) o si la fila de
 * `products` no tiene id o crudos (rowToCachedRaw → null): mejor omitir que
 * servir productos con puntaje incompleto.
 */
export function productSummaryFromRow(rowUnknown: unknown): ProductSummary | null {
  const row = asRecord(rowUnknown);
  if (!row) return null;

  // PostgREST embebe la relación many-to-one como objeto; toleramos array
  // (forma que usa para to-many) tomando el primer elemento.
  const embedded = Array.isArray(row.products) ? row.products[0] : row.products;
  const productRow = asRecord(embedded);
  if (!productRow) return null;

  const cached = rowToCachedRaw(productRow);
  if (!cached) return null; // fila sin id o sin crudos → se omite

  return toProductSummary(cached.raw, {
    id: cached.productId,
    fallbackName: rowFallbackName(cached),
  });
}
