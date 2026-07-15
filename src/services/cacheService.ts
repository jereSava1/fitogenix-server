import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { ENGINE_VERSION } from '../domain/product/ftgEngine';
import { getScoreLabel, getSello } from '../domain/product/scoring';
import { normalizeQuery } from './queryNormalization';
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

// Fila de `products` reconstruida con su identidad y atributos de búsqueda.
// `productId` = products.id (uuid, la identidad — migración 006); `barcode` y
// `nameKey` son los atributos de búsqueda (ambos nullable).
export type CachedProductRow = CachedRaw & {
  productId: string;
  barcode: string | null;
  nameKey: string | null;
};

// Referencia de búsqueda para escribir en el cache: un producto se upsertea
// por su barcode, o por su name_key (query normalizado SIN prefijo) cuando fue
// resuelto solo por IA. La identidad (id) la asigna/devuelve la DB.
export type CacheKeyRef = { barcode: string } | { nameKey: string };

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
 * sin I/O). Compartida entre las lecturas de cache (getCachedProductBy*) y
 * productRowMapper (listados de guardados/historial con productos embebidos
 * vía PostgREST) para que todos apliquen EXACTAMENTE el mismo mapeo.
 *
 * Filas sin `id` o sin datos crudos devuelven null: se tratan como cache miss /
 * se omiten de listados. Un `nutriments` VACÍO ({}) cuenta como AUSENTE — una
 * fila con `{}` y sin ingredients_text no alcanza para recomputar un score con
 * sentido, así que también es miss (se recachea con datos frescos).
 */
export function rowToCachedRaw(data: Record<string, unknown>): CachedProductRow | null {
  // Sin id no hay identidad: la fila no sirve para el payload ni para FKs.
  const productId = typeof data.id === 'string' ? data.id : null;
  if (!productId) return null;

  const ingredientsText =
    typeof data.ingredients_text === 'string' ? data.ingredients_text : undefined;
  const nutriments = asStringRecord(data.nutriments);
  const hasNutriments = nutriments !== undefined && Object.keys(nutriments).length > 0;

  // Fila sin datos crudos (o con nutriments vacío) → tratar como miss.
  if (!ingredientsText && !hasNutriments) return null;

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

  return {
    raw,
    dataSource: typeof data.data_source === 'string' ? data.data_source : 'off',
    productId,
    barcode: typeof data.barcode === 'string' ? data.barcode : null,
    nameKey: typeof data.name_key === 'string' ? data.name_key : null,
  };
}

// Lectura común: una fila por columna única (barcode o name_key).
async function getCachedBy(
  column: 'barcode' | 'name_key',
  value: string,
): Promise<CachedProductRow | null> {
  const { data, error } = await admin()
    .from('products')
    .select('*')
    .eq(column, value)
    .maybeSingle();

  if (error || !data) return null;

  return rowToCachedRaw(data as Record<string, unknown>);
}

/** Lee un producto cacheado por su barcode y reconstruye su crudo. */
export async function getCachedProductByBarcode(
  barcode: string,
): Promise<CachedProductRow | null> {
  return getCachedBy('barcode', barcode);
}

/**
 * Lee un producto cacheado por su name_key (el query normalizado SIN prefijo
 * que originó una fila resuelta por IA) y reconstruye su crudo.
 */
export async function getCachedProductByNameKey(
  nameKey: string,
): Promise<CachedProductRow | null> {
  return getCachedBy('name_key', nameKey);
}

// Escapa los metacaracteres de LIKE/ILIKE (`%`, `_`) y el propio backslash para
// que un token del usuario se matchee literal dentro del patrón.
function escapeLikeToken(token: string): string {
  return token.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Busca en NUESTRO catálogo (`products`) un producto ya cacheado cuyo nombre
 * matchee el query de texto. Se usa como paso previo a la IA en la cascada de
 * búsqueda por nombre: si OFF search falla pero el producto ya existe cacheado
 * (típicamente por barcode, con datos reales), lo servimos de acá y evitamos
 * crear un duplicado solo-IA con otro score.
 *
 * Selección entre múltiples matches: preferimos filas con barcode (datos
 * reales) sobre filas solo-IA, y entre ellas la de nombre más corto (match más
 * ajustado). Filas sin crudos (o sin id) se descartan como candidatas.
 */
export async function findCachedProductByName(
  query: string,
): Promise<CachedProductRow | null> {
  const normalized = normalizeQuery(query);
  // Guard: queries demasiado cortos matchearían medio catálogo ("a", "co").
  if (normalized.length < 3) return null;

  // Patrón %tok1%tok2%...% — los tokens deben aparecer en orden en el nombre.
  const tokens = normalized.split(' ').filter((t) => t.length > 0);
  const pattern = `%${tokens.map(escapeLikeToken).join('%')}%`;

  const { data, error } = await admin()
    .from('products')
    .select('*')
    .ilike('product_name', pattern)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) return null;

  // Candidatas = filas con crudos reconstruibles; el resto son cache miss.
  const candidates = (data as Record<string, unknown>[])
    .map((row) => ({ row, cached: rowToCachedRaw(row) }))
    .filter(
      (c): c is { row: Record<string, unknown>; cached: CachedProductRow } => c.cached !== null,
    );
  if (candidates.length === 0) return null;

  // Orden de preferencia: barcode presente primero, después nombre más corto.
  candidates.sort((a, b) => {
    const aBarcode = a.cached.barcode ? 1 : 0;
    const bBarcode = b.cached.barcode ? 1 : 0;
    if (aBarcode !== bBarcode) return bBarcode - aBarcode;
    const aLen = typeof a.row.product_name === 'string' ? a.row.product_name.length : Infinity;
    const bLen = typeof b.row.product_name === 'string' ? b.row.product_name.length : Infinity;
    return aLen - bLen;
  });

  return candidates[0].cached;
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
