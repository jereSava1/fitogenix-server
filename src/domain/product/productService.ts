/* Utilidades de producto que no son puntuacion.
 *
 * `resolveProductStatus` se mudo al motor (`./scoring/presentation`) para que
 * el estado del producto y las bandas del puntaje salgan del mismo lugar.
 * Tenerlo aca con sus propios umbrales (70/50) era la razon de que un producto
 * de 72 saliera "Bueno" y "Fitogenico" al mismo tiempo.
 */

export { resolveProductStatus } from './scoring/presentation';
export type { ProductStatus } from './scoring/presentation';

export function normalizeProductQuery(query: string | number): string {
  return String(query).trim();
}

export function buildProductSummary(name: string, brand?: string | null): string {
  return [name, brand].filter(Boolean).join(' \u2014 ');
}
