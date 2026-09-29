// El payload que persiste el ETL en `products` (el upsert lo hace el ETL).

import { ENGINE_VERSION, getScoreLabel, getSello, scoreProduct } from '../../scoring';
import { cleanName, extractCategory } from '../domain/productData';
import type { RawProduct } from '../domain/rawProduct';

// Referencia de búsqueda para escribir en el cache: un producto se upsertea
// por su barcode, o por su name_key (query normalizado SIN prefijo) cuando fue
// resuelto solo por IA. La identidad (id) la asigna/devuelve la DB.
export type CacheKeyRef = { barcode: string } | { nameKey: string };

/**
 * Crudos para recalcular al leer, más columnas denormalizadas para listados. Solo va la
 * columna de búsqueda de la key: así un upsert no pisa el otro alias de la fila. */
export function buildCachePayload(raw: RawProduct, key: CacheKeyRef): Record<string, unknown> {
  const { score } = scoreProduct(raw);
  return {
    ...('barcode' in key ? { barcode: key.barcode } : { name_key: key.nameKey }),
    // ── denormalizados para listados ──
    product_name: cleanName(raw.product_name, 'barcode' in key ? key.barcode : key.nameKey),
    brand: raw.brands || null,
    category: extractCategory(raw.categories) || null,
    image_url: raw.image_front_url ?? raw.image_url ?? null,
    score,
    score_label: getScoreLabel(score).label,
    sello: getSello(score),
    // ── CRUDOS para recomputar ──
    ingredients_text: raw.ingredients_text ?? null,
    nutriments: raw.nutriments ?? null,
    nova_group: raw.nova_group ?? null,
    additives_tags: raw.additives_tags ?? null,
    data_source: raw._aiSource ? 'ai' : 'off',
    ai_enriched: raw._aiEnriched === true,
    engine_version: ENGINE_VERSION,
    updated_at: new Date().toISOString(),
  };
}

