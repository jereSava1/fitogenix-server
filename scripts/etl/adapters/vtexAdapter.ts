import type { RawOFFProduct } from '../../../src/types/fitogenix';
import { normalizeBarcode } from '../lib/barcode';

// Shape parcial de la respuesta de `GET /api/catalog_system/pub/products/search`
// de VTEX. Confirmado en vivo contra jumbo.com.ar, disco.com.ar, vea.com.ar y
// carrefour.com.ar (recon 2026-08-06) — los 4 responden JSON sin auth con esta
// forma general. Solo tipamos los campos que usamos; si algún retailer difiere
// en un campo opcional, verificar contra una respuesta real de ESE dominio
// antes de correr en volumen (no asumir que los 4 son 100% idénticos).
type VtexItem = {
  itemId?: string;
  ean?: string;
  images?: { imageUrl?: string }[];
};
type VtexProduct = {
  productName?: string;
  brand?: string;
  categories?: string[]; // ej. ["/Almacén/Galletitas Dulces/"]
  items?: VtexItem[];
};

export type AdaptedProduct = { barcode: string; raw: RawOFFProduct };

/**
 * Códigos internos de balanza/PLU (productos de peso variable: verdulería,
 * fiambrería) — confirmados en el recon con prefijo '2' y 13 dígitos. No son
 * EAN reales: no matchean contra OFF y no representan un producto envasado
 * con ingredientes/tabla nutricional fija. Se descartan, no se cachean.
 */
function isInternalPluCode(ean: string): boolean {
  return ean.startsWith('2') && ean.length === 13;
}

/** "/Almacén/Galletitas Dulces/" → "Almacén > Galletitas Dulces". Mapeo a la
 * taxonomía interna de Fitogenix (equivalente a extractCategory() para OFF)
 * queda pendiente — ver Fase 3 de 06-agente-etl-data.md, "lo que no se
 * resuelve automáticamente". Por ahora se preserva el string crudo del
 * retailer, legible pero sin normalizar contra las categorías de Fitogenix. */
function cleanCategory(categories?: string[]): string | undefined {
  const first = categories?.[0];
  if (!first) return undefined;
  return first.split('/').filter(Boolean).join(' > ');
}

/**
 * Adapta un producto VTEX a una lista de RawOFFProduct — un producto puede
 * tener varios SKUs/items (ej. mismo producto en presentaciones distintas),
 * cada uno con su propio EAN, así que devuelve un array (0, 1 o más).
 *
 * Deliberadamente NO setea ingredients_text/nutriments/nova_group/
 * additives_tags: un retailer nunca los trae (ver Fase 3 de
 * 06-agente-etl-data.md — una página de venta muestra nombre/marca/EAN/
 * imagen, no la tabla nutricional). Quedan `undefined` a propósito, para que
 * el gate de completitud de la Fase 3 los detecte como gap real.
 */
export function adaptVtexProduct(product: VtexProduct): AdaptedProduct[] {
  const results: AdaptedProduct[] = [];
  const category = cleanCategory(product.categories);

  for (const item of product.items ?? []) {
    const rawEan = item.ean?.trim();
    // El chequeo de PLU va sobre el crudo (prefijo '2' + 13 dígitos, definido
    // así en el recon) — normalizeBarcode no toca códigos de 13 dígitos, pero
    // el orden importa conceptualmente: PLU se descarta ANTES de normalizar.
    if (!rawEan || isInternalPluCode(rawEan)) continue;
    const ean = normalizeBarcode(rawEan);
    if (!ean) continue;

    results.push({
      barcode: ean,
      raw: {
        product_name: product.productName,
        brands: product.brand,
        image_url: item.images?.[0]?.imageUrl,
        categories: category,
      },
    });
  }

  return results;
}
