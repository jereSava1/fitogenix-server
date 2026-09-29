/* Escritura en `products` (lo que persiste el catálogo).
 *
 * Antes vivía en `services/cacheService.ts`; se mudó en M-04 sin cambios. El
 * ETL usa `buildCachePayload` (hoy lo importa directo; pasa a la API pública
 * de catalog en M-08/M-09).
 */

import { supabaseAdmin as admin } from '../../../platform/supabase';
import { ENGINE_VERSION, getScoreLabel, getSello } from '../../scoring';
import { normalizeQuery } from '../domain/query';
import type { FitogenixProduct, RawOFFProduct } from '../../../types/fitogenix';

// Referencia de búsqueda para escribir en el cache: un producto se upsertea
// por su barcode, o por su name_key (query normalizado SIN prefijo) cuando fue
// resuelto solo por IA. La identidad (id) la asigna/devuelve la DB.
export type CacheKeyRef = { barcode: string } | { nameKey: string };

// Escapa los metacaracteres de LIKE/ILIKE (`%`, `_`) y el propio backslash para
// que un token del usuario se matchee literal dentro del patrón.
function escapeLikeToken(token: string): string {
  return token.replace(/[\\%_]/g, (c) => `\\${c}`);
}

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
 * existente (p.ej. una fila upgradeada name→barcode conserva su name_key).
 */
export function buildCachePayload(
  product: FitogenixProduct,
  raw: RawOFFProduct,
  key: CacheKeyRef,
): Record<string, unknown> {
  return {
    ...('barcode' in key ? { barcode: key.barcode } : { name_key: key.nameKey }),
    // ── denormalizados para listados ──
    product_name: product.name,
    brand: product.brand || null,
    category: product.category || null,
    image_url: product.imageUrl ?? null,
    score: product.score,
    score_label: getScoreLabel(product.score).label,
    sello: getSello(product.score),
    // ── CRUDOS para recomputar ──
    ingredients_text: raw.ingredients_text ?? null,
    nutriments: raw.nutriments ?? null,
    nova_group: raw.nova_group ?? null,
    additives_tags: raw.additives_tags ?? null,
    data_source: product.dataSource,
    ai_enriched: raw._aiEnriched === true || product.aiEnriched === true,
    engine_version: ENGINE_VERSION,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Upgrade name→barcode: busca una fila SIN barcode (resuelta por IA vía
 * búsqueda por nombre) cuyo product_name normalizado coincida EXACTO con el
 * del producto nuevo. Si existe, es el mismo producto entrando ahora por
 * barcode: hay que ACTUALIZAR esa fila en vez de crear otra, así los guardados
 * e historial que la referencian sobreviven y el catálogo no se duplica.
 *
 * Nota: el prefiltro ILIKE usa tokens normalizados (sin acentos), así que un
 * product_name guardado CON acentos puede escaparse del prefiltro; es un
 * best-effort barato, no una garantía de dedupe total.
 */
async function findUpgradableNameRow(productName: string): Promise<string | null> {
  const normalized = normalizeQuery(productName);
  if (normalized.length < 3) return null;

  const tokens = normalized.split(' ').filter((t) => t.length > 0);
  const pattern = `%${tokens.map(escapeLikeToken).join('%')}%`;

  const { data, error } = await admin()
    .from('products')
    .select('id, product_name')
    .is('barcode', null)
    .ilike('product_name', pattern)
    .limit(5);

  if (error || !data) return null;

  for (const rowUnknown of data as Record<string, unknown>[]) {
    if (
      typeof rowUnknown.id === 'string' &&
      typeof rowUnknown.product_name === 'string' &&
      normalizeQuery(rowUnknown.product_name) === normalized
    ) {
      return rowUnknown.id;
    }
  }

  return null;
}

/**
 * Persiste (o refresca) un producto en el cache y devuelve el `id` (uuid) de
 * la fila — el caller lo necesita para `product.productId` en el payload, por
 * eso ahora se AWAITEA (antes era fire-and-forget).
 *
 * Con barcode, primero intenta el upgrade name→barcode (ver
 * findUpgradableNameRow): UPDATE de la fila existente conservando su name_key
 * como alias. Si no hay fila upgradeable, upsert por la columna de búsqueda
 * (`barcode` o `name_key`).
 *
 * No usamos ignoreDuplicates para poder REFRESCAR datos crudos y score (el
 * score puede cambiar entre versiones del motor). Errores de DB se loguean y
 * devuelven null: el lookup igual responde, solo que sin productId.
 */
export async function setCachedProduct(
  product: FitogenixProduct,
  raw: RawOFFProduct,
  key: CacheKeyRef,
): Promise<string | null> {
  const payload = buildCachePayload(product, raw, key);

  // Upgrade name→barcode: el producto entró antes por nombre (fila sin
  // barcode) y ahora llega por barcode → misma fila, id conservado.
  if ('barcode' in key) {
    try {
      const upgradableId = await findUpgradableNameRow(product.name);
      if (upgradableId) {
        // El payload de barcode NO trae name_key → el alias se conserva.
        const { data, error } = await admin()
          .from('products')
          .update(payload)
          .eq('id', upgradableId)
          .select('id')
          .single();

        if (!error && data && typeof (data as Record<string, unknown>).id === 'string') {
          return (data as Record<string, unknown>).id as string;
        }
        console.error(
          '[cacheService] setCachedProduct upgrade update error:',
          error?.message ?? 'sin id en la respuesta',
        );
        // Cae al upsert normal como último recurso.
      }
    } catch (err) {
      console.error('[cacheService] setCachedProduct upgrade lookup error:', err);
    }
  }

  const { data, error } = await admin()
    .from('products')
    .upsert(payload, { onConflict: 'barcode' in key ? 'barcode' : 'name_key' })
    .select('id')
    .single();

  if (error || !data || typeof (data as Record<string, unknown>).id !== 'string') {
    console.error(
      '[cacheService] setCachedProduct upsert error:',
      error?.message ?? 'sin id en la respuesta',
    );
    return null;
  }

  return (data as Record<string, unknown>).id as string;
}
