// Detalle por uuid: lo que abre la app desde un guardado o el historial. Va directo a la
// base (Redis está indexado por barcode y query) y no registra el escaneo.

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
