import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { ENGINE_VERSION } from '../domain/product/ftgEngine';
import { getScoreLabel, getSello } from '../domain/product/scoring';
import type { FitogenixProduct, RawOFFProduct } from '../types/fitogenix';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: ReturnType<typeof createClient<any>> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): ReturnType<typeof createClient<any>> => {
  if (!_admin) _admin = createClient(config.supabaseUrl, config.supabaseSecretKey);
  return _admin;
};

// Lo que devuelve la lectura del cache: los datos CRUDOS reconstruidos como
// un RawOFFProduct (para que pasen por el MISMO mapOFFToProduct que un lookup
// fresco) más el dataSource de la fila. El score NO se guarda: se recomputa.
export type CachedRaw = {
  raw: RawOFFProduct;
  dataSource: string;
};

// Type guards mínimos para leer columnas jsonb sin `any`.
function asStringRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
}

/**
 * Reconstruye el RawOFFProduct crudo desde una fila de `products` (función PURA,
 * sin I/O). Compartida entre getCachedProduct (hit de cache) y
 * savedProductsService (listado de guardados con productos embebidos vía
 * PostgREST) para que ambos apliquen EXACTAMENTE el mismo mapeo.
 *
 * Filas viejas (pre-migración) que no tienen ingredients_text ni nutriments
 * devuelven null: se tratan como cache miss / se omiten de listados. Así
 * degradamos con gracia sin servir productos con breakdown/subscores
 * incompletos.
 */
export function rowToCachedRaw(data: Record<string, unknown>): CachedRaw | null {
  const ingredientsText =
    typeof data.ingredients_text === 'string' ? data.ingredients_text : undefined;
  const nutriments = asStringRecord(data.nutriments);

  // Fila vieja sin datos crudos → tratar como miss para recachear.
  if (!ingredientsText && !nutriments) return null;

  const raw: RawOFFProduct = {
    product_name: typeof data.product_name === 'string' ? data.product_name : undefined,
    brands: typeof data.brand === 'string' ? data.brand : undefined,
    image_url: typeof data.image_url === 'string' ? data.image_url : undefined,
    ingredients_text: ingredientsText,
    nutriments,
    nova_group: typeof data.nova_group === 'number' ? data.nova_group : undefined,
    additives_tags: asStringArray(data.additives_tags),
    categories: typeof data.category === 'string' ? data.category : undefined,
    _aiEnriched: data.ai_enriched === true,
    _aiSource: data.data_source === 'ai',
  };

  return { raw, dataSource: typeof data.data_source === 'string' ? data.data_source : 'off' };
}

/**
 * Lee un producto cacheado por su clave unificada (`cache_key`) y reconstruye su
 * RawOFFProduct crudo. La clave es el barcode para productos con código, o
 * 'name:<nombre normalizado>' para los resueltos solo por IA.
 */
export async function getCachedProduct(cacheKey: string): Promise<CachedRaw | null> {
  const { data, error } = await admin()
    .from('products')
    .select('*')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (error || !data) return null;

  return rowToCachedRaw(data as Record<string, unknown>);
}

/**
 * Construye el payload que se persiste en Supabase.
 *
 * Guarda los datos CRUDOS (ingredients_text ya traducido/enriquecido,
 * nutriments jsonb, nova_group, additives_tags) para poder recomputar el score
 * al leer, más campos denormalizados (product_name, brand, category, image_url,
 * score, score_label) para listados sin recomputar.
 */
export function buildCachePayload(
  product: FitogenixProduct,
  raw: RawOFFProduct,
  cacheKey: string,
  barcode: string | null,
): Record<string, unknown> {
  return {
    cache_key: cacheKey,
    barcode,
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

export async function setCachedProduct(
  product: FitogenixProduct,
  raw: RawOFFProduct,
  cacheKey: string,
  barcode: string | null,
): Promise<void> {
  const payload = buildCachePayload(product, raw, cacheKey, barcode);

  // Nota: no usamos ignoreDuplicates para poder REFRESCAR datos crudos y score
  // (el score puede cambiar entre versiones del motor). Requiere el UNIQUE
  // constraint sobre cache_key. Si el constraint aún no está aplicado, el upsert
  // falla y lo logueamos — el lookup ya devolvió el producto igual.
  const { error } = await admin()
    .from('products')
    .upsert(payload, { onConflict: 'cache_key' });

  if (error) {
    console.error('[cacheService] setCachedProduct upsert error:', error.message);
  }
}
