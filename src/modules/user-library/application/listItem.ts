// Fila de guardados o historial → resumen del producto más la fecha de la fila.

import { productSummaryFromRow, type ProductSummary } from '../../catalog';

/** La fecha de Postgres (`2026-09-29T12:34:56.123456+00:00`) en ISO 8601 UTC
 *  con milisegundos, la forma de `date-time` que recibe la app. */
function toIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** `null` si la fila no sirve (sin producto, sin crudos o sin fecha legible): se omite. */
export function summaryWithDate(
  row: unknown,
  column: 'created_at' | 'scanned_at',
): { product: ProductSummary; at: string } | null {
  const product = productSummaryFromRow(row);
  if (!product) return null;
  const at = toIso((row as Record<string, unknown>)[column]);
  return at ? { product, at } : null;
}
