/* El detalle de un producto por su identidad: `GET /v1/products/:id` (K-04,
 * 03-contratos §B.3.2).
 *
 * Es lo que abre la app al tocar un guardado o un ítem del historial: los
 * listados traen `ProductSummary` y el detalle se pide aparte. Lee directo de
 * la base (sin Redis: el cache está indexado por barcode y por query, no por
 * uuid) y presenta con el mismo `toProductDetail` que el lookup. No registra
 * el escaneo: abrir algo que ya está en la lista no es escanearlo.
 */

import type { ProductReader } from './ports';
import { rowFallbackName, toProductDetail, type ProductDetail } from './productResponse';

export type GetProduct = (id: string) => Promise<ProductDetail | null>;

export function makeGetProduct(deps: { reader: ProductReader }): GetProduct {
  return async function getProduct(id) {
    const row = await deps.reader.findById(id);
    if (!row) return null;
    return toProductDetail(row.raw, { id: row.productId, fallbackName: rowFallbackName(row) });
  };
}
