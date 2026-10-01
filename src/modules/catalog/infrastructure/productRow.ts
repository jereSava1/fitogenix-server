// Fila de `products` → crudo reconstruido (puro, sin I/O).

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
 * Fila de `products` → crudo. Sin `id` o sin crudos (un `nutriments` vacío cuenta como
 * ausente) devuelve null: miss en el lookup, se omite en los listados. */
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
    additives_tags: asStringArray(data.additives_tags),
    categories: typeof data.category === 'string' ? data.category : undefined,
    _aiEnriched: data.ai_enriched === true,
  };

  return {
    raw,
    dataSource: typeof data.data_source === 'string' ? data.data_source : 'off',
    productId,
    barcode: typeof data.barcode === 'string' ? data.barcode : null,
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * El resumen desde una fila join `{ product_id, products }` (guardados, historial). Null si
 * falta el producto embebido o no tiene id o crudos: mejor omitir que mostrar a medias. */
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
