/* Una fila de `saved_products` o `scan_history` (con el producto embebido) →
 * el resumen del producto más la fecha de la fila. Lo comparten los listados
 * de guardados e historial (K-04, 03-contratos §B.3.1).
 */

import { productSummaryFromRow, type ProductSummary } from '../../catalog';

/** La fecha de Postgres (`2026-09-29T12:34:56.123456+00:00`) en ISO 8601 UTC
 *  con milisegundos, la forma de `date-time` que recibe la app. */
function toIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * `null` si la fila no sirve: sin producto, producto sin crudos (mismo
 * criterio de siempre) o sin una fecha legible en `column`. Se omite del
 * listado: mejor una lista corta que un ítem a medias.
 */
export function summaryWithDate(
  row: unknown,
  column: 'created_at' | 'scanned_at',
): { product: ProductSummary; at: string } | null {
  const product = productSummaryFromRow(row);
  if (!product) return null;
  const at = toIso((row as Record<string, unknown>)[column]);
  return at ? { product, at } : null;
}
