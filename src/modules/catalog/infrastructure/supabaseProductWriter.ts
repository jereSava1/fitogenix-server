/* Escritura en `products`: el payload que persiste el ETL.
 *
 * Antes vivía en `services/cacheService.ts`; se mudó en M-04. El ETL usa
 * `buildCachePayload` (hoy lo importa directo; pasa a la API pública de
 * catalog en M-08/M-09) y hace el upsert con su propio cliente. La escritura
 * del lado del server (`setCachedProduct` y el upgrade name→barcode) se borró
 * en M-04 por no tener consumidores (D-65).
 */

import { ENGINE_VERSION, getScoreLabel, getSello, scoreProduct } from '../../scoring';
import { cleanName, extractCategory } from '../domain/productData';
import type { RawProduct } from '../domain/rawProduct';

// Referencia de búsqueda para escribir en el cache: un producto se upsertea
// por su barcode, o por su name_key (query normalizado SIN prefijo) cuando fue
// resuelto solo por IA. La identidad (id) la asigna/devuelve la DB.
export type CacheKeyRef = { barcode: string } | { nameKey: string };

/**
 * Construye el payload que se persiste en Supabase.
 *
 * Guarda los datos CRUDOS (ingredients_text ya traducido/enriquecido,
 * nutriments jsonb, nova_group, additives_tags) para poder recomputar el score
 * al leer, más campos denormalizados (product_name, brand, category, image_url,
 * score, score_label) para listados sin recomputar.
 *
 * Solo incluye la columna de búsqueda que corresponde a la key (`barcode` o
 * `name_key`): la otra se OMITE para que un upsert/update no pise un alias
 * existente (p.ej. una fila que ya tiene name_key lo conserva al upsertear por barcode).
 *
 * Hasta K-04 recibía la respuesta de la API ya armada (`FitogenixProduct`) y
 * copiaba de ahí; ahora calcula cada columna desde el crudo, así el contrato
 * con la app puede cambiar sin mover la fila (lo fija
 * `supabaseProductWriter.test.ts` con los 200 productos de la muestra).
 */
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

