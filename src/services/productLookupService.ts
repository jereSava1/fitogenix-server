import {
  extractCategory,
  extractNutrition,
  ftgAnalyzeIngredients,
  ftgScoreWithBreakdown,
} from '../domain/product/ftgEngine';
import { getScoreLabel, getScoreTagline } from '../domain/product/scoring';
import { resolveProductStatus } from '../domain/product/productService';
import { aiLookupProduct, enrichWithAI } from './claudeService';
import {
  findCachedProductByName,
  getCachedProductByBarcode,
  getCachedProductByNameKey,
  setCachedProduct,
} from './cacheService';
import type { CacheKeyRef } from './cacheService';
import { normalizeQuery } from './queryNormalization';
import {
  getFromRedis,
  getSearchBarcode,
  setInRedis,
  setSearchBarcode,
} from './redisService';
import {
  OffServiceUnavailableError,
  completeResolvedMatch,
  fetchProductByBarcode,
  resolveQueryToCode,
} from './offService';
import { fetchRetailerImage, fetchSearchImageUrl } from './imageService';
import { fetchBeautyProductByBarcode } from './openBeautyFactsApi';
import { fetchEdamamByBarcode } from './fallbackFoodApi';
import type { FitogenixProduct, RawOFFProduct } from '../types/fitogenix';

type LookupSource = 'redis' | 'supabase' | 'catalog' | 'off' | 'obf' | 'edamam' | 'ai';

// `source` = nivel de la cascada que sirvió ESTA request (redis/supabase = cache).
// `dataSource` = proveedor ORIGINAL del dato (off/obf/edamam/ai), preservado a
// través del cache. Loguear ambos permite analítica de origen incluso en hits.
// `cacheKey` acá es la clave INTERNA de proceso (barcode o 'name:<...>'), no la
// identidad del producto (esa es products.id).
function logSource(cacheKey: string, source: LookupSource, dataSource: string): void {
  console.info(JSON.stringify({ event: 'product_lookup', cacheKey, source, dataSource }));
}

// Clave INTERNA (Redis/in-flight/logs) para búsquedas por nombre sin barcode
// (resueltas por IA). Normaliza (minúsculas, sin acentos, espacios colapsados —
// ver queryNormalization) para maximizar hits entre búsquedas equivalentes, y
// prefija 'name:' para no colisionar con barcodes. A la DB va SIN prefijo
// (columna name_key).
function nameKey(query: string): string {
  return `name:${normalizeQuery(query)}`;
}

// Presentación derivada del score — única fuente de verdad de los umbrales.
// El cliente consume estos campos en vez de recalcularlos.
function scorePresentation(score: number): Pick<
  FitogenixProduct,
  'scoreLabel' | 'scoreColor' | 'tagline' | 'fito'
> {
  const { label, color } = getScoreLabel(score);
  const status = resolveProductStatus(score);
  const fito =
    status.label === 'Fitogénico' ? 'fito' :
    status.label === 'No fitogénico' ? 'nofito' : 'none';
  return { scoreLabel: label, scoreColor: color, tagline: getScoreTagline(score), fito };
}

function cleanName(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  return raw
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+\d{8,14}\b/g, '')
    .replace(/\s+\d+\s*(?:g|gr|kg|ml|l|lts?|cc|oz)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

// Exportada para reutilizarla en productRowMapper (listados de guardados e
// historial): los productos guardados se recomputan con el MISMO mapeo que un
// lookup.
export function mapOFFToProduct(off: RawOFFProduct, query: string): FitogenixProduct {
  const breakdown = ftgScoreWithBreakdown(off);
  const ingredients = ftgAnalyzeIngredients(off);
  const nutrition = extractNutrition(off.nutriments);

  return {
    id: query,
    name: cleanName(off.product_name, String(query)),
    subtitle: off.quantity ?? null,
    brand: off.brands ?? '',
    category: extractCategory(off.categories),
    categoryEmoji: '🍽️',
    score: breakdown.score,
    flagged: breakdown.score < 40,
    emoji: '📦',
    bgColor: '#f8faf7',
    imageUrl: off.image_front_url ?? off.image_url ?? null,
    summary: null,
    ingredients,
    nutrition,
    subscores: {
      toxicidad: breakdown.components.toxicidad.score,
      nutricion: breakdown.components.nutricion.score,
      procesamiento: breakdown.components.procesamiento.score,
      alineacion: breakdown.components.alineacion.score,
    },
    breakdown,
    alternatives: [],
    dataSource: off._aiSource ? 'ai' : 'off',
    // Default para tipar; los resolutores la pisan con el id real de la fila
    // en `products` (del hit de cache, del catálogo o del upsert awaiteado).
    productId: '',
    aiEnriched: off._aiEnriched,
    ...scorePresentation(breakdown.score),
  };
}

// Deduplicación in-flight (singleflight): si varias requests piden la misma
// clave a la vez, comparten una sola resolución en curso. Keyed por la clave
// interna de proceso (barcode o 'name:<...>').
const inFlight = new Map<string, Promise<FitogenixProduct | null>>();

// `cacheKey` es la clave INTERNA de proceso (Redis/in-flight/logs): barcode o
// 'name:<...>'. `dbKey` es la referencia de búsqueda en la DB ({ barcode } o
// { nameKey } sin prefijo); de ella se deriva el barcode real cuando existe
// (para OBF/Edamam y la imagen de retailer).
async function resolveWithImages(
  cacheKey: string,
  dbKey: CacheKeyRef,
  fetchData: () => Promise<RawOFFProduct | null>,
  originalQuery: string,
): Promise<FitogenixProduct | null> {
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = doResolveWithImages(cacheKey, dbKey, fetchData, originalQuery).finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, promise);
  return promise;
}

async function doResolveWithImages(
  cacheKey: string,
  dbKey: CacheKeyRef,
  fetchData: () => Promise<RawOFFProduct | null>,
  originalQuery: string,
): Promise<FitogenixProduct | null> {
  const barcode = 'barcode' in dbKey ? dbKey.barcode : null;

  // Level 1 — Redis (fastest, in-memory cache)
  const redisHit = await getFromRedis(cacheKey);
  // Entradas viejas (pre-migración 006) no traen productId serializado: sin él
  // el cliente no puede guardar el producto, así que se tratan como miss y el
  // nivel Supabase las repobla con el campo nuevo.
  if (redisHit && typeof redisHit.productId === 'string' && redisHit.productId) {
    logSource(cacheKey, 'redis', redisHit.dataSource);
    return redisHit;
  }

  // Level 2 — Supabase (persistent cache). Guardamos crudos → recomputamos con
  // el MISMO mapOFFToProduct que un lookup fresco, así el cacheado es idéntico.
  const cached =
    'barcode' in dbKey
      ? await getCachedProductByBarcode(dbKey.barcode)
      : await getCachedProductByNameKey(dbKey.nameKey);
  if (cached) {
    const product = mapOFFToProduct(cached.raw, originalQuery);
    product.dataSource = cached.dataSource;
    product.productId = cached.productId;
    logSource(cacheKey, 'supabase', product.dataSource);
    // Populate Redis so next hit is faster; use shorter TTL if AI-sourced
    const ttl = product.dataSource === 'ai' ? 259200 : 604800;
    setInRedis(cacheKey, product, ttl).catch((err: unknown) =>
      console.error('[productLookupService] setInRedis error:', err),
    );
    return product;
  }

  // Level 3 — cascada de fuentes crudas + Claude (cold path)
  // La imagen de retailer se busca por barcode; sin barcode (producto solo-IA)
  // no aplica.
  const retailerPromise = barcode ? fetchRetailerImage(barcode) : Promise.resolve(null);

  // Cascada de datos crudos, cortando ni bien haya match. Solo el nivel OFF
  // aplica sin barcode (búsqueda por nombre); OBF y Edamam son estrictamente
  // por barcode. Cada nivel se envuelve en try/catch: si falla (timeout/500)
  // logueamos y seguimos al siguiente, nunca crasheamos la cascada.
  let data: RawOFFProduct | null = null;
  let source: LookupSource = 'off';

  // Nivel OFF (o search→completeResolvedMatch para el path por nombre).
  try {
    data = await fetchData();
  } catch (err) {
    console.error('[productLookupService] fallo nivel OFF:', err);
  }

  // Nivel OBF (Open Beauty Facts) — solo por barcode.
  if (!data && barcode) {
    try {
      data = await fetchBeautyProductByBarcode(barcode);
      if (data) source = 'obf';
    } catch (err) {
      console.error('[productLookupService] fallo nivel OBF:', err);
    }
  }

  // Nivel Edamam — solo por barcode. Saltea internamente si faltan las keys.
  if (!data && barcode) {
    try {
      data = await fetchEdamamByBarcode(barcode);
      if (data) source = 'edamam';
    } catch (err) {
      console.error('[productLookupService] fallo nivel Edamam:', err);
    }
  }

  if (data) {
    data = await enrichWithAI(data);
  } else {
    // Último recurso — Claude.
    const ai = await aiLookupProduct(originalQuery);
    if (!ai) return null;
    data = await enrichWithAI(ai);
    source = 'ai';
  }

  const product = mapOFFToProduct(data, originalQuery);
  // mapOFFToProduct deriva dataSource del flag _aiSource; para OBF/Edamam es
  // dato "real" (no IA), así que reflejamos la fuente de la cascada.
  if (source === 'obf' || source === 'edamam') product.dataSource = source;
  logSource(cacheKey, product.dataSource === 'ai' ? 'ai' : source, product.dataSource);

  const retailerImage = await retailerPromise;
  if (!product.imageUrl && retailerImage) product.imageUrl = retailerImage;
  if (!product.imageUrl) {
    const searchImage = await fetchSearchImageUrl(product.name, product.brand);
    if (searchImage) product.imageUrl = searchImage;
  }

  // Persistencia en Supabase AWAITEADA: el upsert devuelve el id de la fila y
  // el payload lo necesita (productId). Agrega ~100-300ms a un cold path que
  // ya tarda segundos; los hits de cache no cambian. Si falla, el producto se
  // sirve igual con productId vacío (el cliente no podrá guardarlo esta vez).
  try {
    const productId = await setCachedProduct(product, data, dbKey);
    if (productId) product.productId = productId;
  } catch (err) {
    console.error('[productLookupService] setCachedProduct error:', err);
  }

  // Redis sigue fire-and-forget (ya con productId en el payload serializado).
  const ttl = product.dataSource === 'ai' ? 259200 : 604800;
  setInRedis(cacheKey, product, ttl).catch((err: unknown) =>
    console.error('[productLookupService] setInRedis (cold) error:', err),
  );

  return product;
}

export async function lookupProduct(query: string): Promise<FitogenixProduct | null> {
  const trimmed = String(query).trim();
  const isBarcode = /^\d{8,14}$/.test(trimmed);

  if (isBarcode) {
    return resolveWithImages(
      trimmed, // clave interna = barcode
      { barcode: trimmed },
      () => fetchProductByBarcode(trimmed),
      trimmed,
    );
  }

  // Fase 3 — cache texto→barcode. Si otra request ya resolvió esta misma query,
  // saltamos el OFF search (~500ms) y vamos directo al barcode cacheado.
  // getSearchBarcode normaliza internamente (lowercase+trim), así que le pasamos
  // `trimmed` tal cual; no duplicamos la normalización acá.
  const cachedBarcode = await getSearchBarcode(trimmed);
  if (cachedBarcode) {
    return resolveWithImages(
      cachedBarcode, // clave interna = barcode
      { barcode: cachedBarcode },
      () => fetchProductByBarcode(cachedBarcode),
      trimmed,
    );
  }

  let resolved: Awaited<ReturnType<typeof resolveQueryToCode>>;
  try {
    resolved = await resolveQueryToCode(trimmed);
  } catch (err) {
    if (err instanceof OffServiceUnavailableError) {
      resolved = null;
    } else {
      throw err;
    }
  }

  if (!resolved) {
    // Antes de gastar IA, buscamos en NUESTRO catálogo (`products`) por nombre:
    // si el producto ya está cacheado (típicamente por barcode, con datos
    // reales), lo servimos de acá y evitamos duplicarlo como fila solo-IA con
    // otro score. Envuelto en try/catch: si el catálogo falla, la cascada
    // sigue a la IA — nunca crashea.
    try {
      const catalogHit = await findCachedProductByName(trimmed);
      if (catalogHit) {
        const product = mapOFFToProduct(catalogHit.raw, trimmed);
        product.dataSource = catalogHit.dataSource;
        product.productId = catalogHit.productId;
        // Clave interna de la fila para Redis/logs: su barcode, o 'name:<...>'
        // si es una fila solo-IA con name_key.
        const internalKey =
          catalogHit.barcode ??
          (catalogHit.nameKey ? `name:${catalogHit.nameKey}` : null);
        logSource(internalKey ?? catalogHit.productId, 'catalog', product.dataSource);
        if (internalKey) {
          // Poblamos Redis bajo la clave de la fila para acelerar próximos hits.
          const ttl = product.dataSource === 'ai' ? 259200 : 604800;
          setInRedis(internalKey, product, ttl).catch((err: unknown) =>
            console.error('[productLookupService] setInRedis (catalog) error:', err),
          );
        }
        // Si la fila tiene barcode, cacheamos query→barcode: la próxima búsqueda
        // idéntica salta directo al barcode sin pasar por OFF search ni catálogo.
        if (catalogHit.barcode) {
          setSearchBarcode(trimmed, catalogHit.barcode).catch((err: unknown) =>
            console.error('[productLookupService] setSearchBarcode (catalog) error:', err),
          );
        }
        return product;
      }
    } catch (err) {
      console.error('[productLookupService] fallo catálogo propio:', err);
    }

    // Sin match en OFF → producto resuelto solo por IA. No tiene barcode, así
    // que en la DB se guarda con name_key = <query normalizado SIN prefijo>
    // (barcode null); la clave interna de Redis/in-flight sí lleva el prefijo
    // 'name:'. En la próxima búsqueda idéntica lo sirve getCachedProductByNameKey
    // y NO se vuelve a pedir IA. fetchData devuelve null a propósito →
    // doResolveWithImages cae al aiLookup.
    return resolveWithImages(
      nameKey(trimmed), // clave interna 'name:<...>'
      { nameKey: normalizeQuery(trimmed) }, // a la DB va sin prefijo
      async () => null,
      trimmed,
    );
  }

  // Guardamos la asociación query→barcode para futuras búsquedas idénticas.
  // Fire-and-forget: no bloquea el lookup; el error se loguea.
  setSearchBarcode(trimmed, resolved.code).catch((err: unknown) =>
    console.error('[productLookupService] setSearchBarcode error:', err),
  );

  return resolveWithImages(
    resolved.code, // clave interna = barcode
    { barcode: resolved.code },
    () => completeResolvedMatch(resolved.code, resolved.fields),
    trimmed,
  );
}
