// El payload que persiste el ETL en `products` (el upsert lo hace el ETL).

import { cleanName, extractCategory } from '../domain/productData';
import type { RawProduct } from '../domain/rawProduct';

/** Crudos para recalcular al leer, más los datos para mostrar en listados. El puntaje no se
 *  guarda: se calcula al leer (D-35). */
export function buildCachePayload(raw: RawProduct, barcode: string): Record<string, unknown> {
  return {
    barcode,
    product_name: cleanName(raw.product_name, barcode),
    brand: raw.brands || null,
    category: extractCategory(raw.categories) || null,
    image_url: raw.image_front_url ?? raw.image_url ?? null,
    ingredients_text: raw.ingredients_text ?? null,
    nutriments: raw.nutriments ?? null,
    additives_tags: raw.additives_tags ?? null,
    data_source: 'off', // runMerge lo pisa con la fuente principal
    ai_enriched: raw._aiEnriched === true,
    updated_at: new Date().toISOString(),
  };
}
