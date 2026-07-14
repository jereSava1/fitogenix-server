import {
  extractCategory,
  extractNutrition,
  ftgAnalyzeIngredients,
  ftgScoreWithBreakdown,
} from '../domain/product/ftgEngine';
import { getScoreLabel, getScoreTagline } from '../domain/product/scoring';
import { resolveProductStatus } from '../domain/product/productService';
import { aiLookupProduct, enrichWithAI } from './claudeService';
import { findCachedProductByName, getCachedProduct, setCachedProduct } from './cacheService';
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
function logSource(cacheKey: string, source: LookupSource, dataSource: string): void {
  console.info(JSON.stringify({ event: 'product_lookup', cacheKey, source, dataSource }));
}

// Clave de cache para búsquedas por nombre sin barcode (resueltas por IA).
// Normaliza (minúsculas, sin acentos, espacios colapsados — ver
// queryNormalization) para maximizar hits entre búsquedas equivalentes, y
// prefija 'name:' para no colisionar con barcodes.
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

// Exportada para reutilizarla en savedProductsService (listado de guardados):
// los productos guardados se recomputan con el MISMO mapeo que un lookup.
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
    // Default para tipar; los resolutores la pisan con la clave real de cache.
    cacheKey: query,
    aiEnriched: off._aiEnriched,
    ...scorePresentation(breakdown.score),
  };
}

// Deduplicación in-flight (singleflight): si varias requests piden la misma
// clave a la vez, comparten una sola resolución en curso. Keyed por cacheKey.
const inFlight = new Map<string, Promise<FitogenixProduct | null>>();

// `cacheKey` es la clave unificada de cache (barcode o 'name:<...>'). `barcode`
// es el código real cuando existe (null para productos resueltos solo por IA);
// se usa para la columna barcode y para buscar imagen de retailer.
async function resolveWithImages(
  cacheKey: string,
  barcode: string | null,
  fetchData: () => Promise<RawOFFProduct | null>,
  originalQuery: string,
): Promise<FitogenixProduct | null> {
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = doResolveWithImages(cacheKey, barcode, fetchData, originalQuery).finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, promise);
  return promise;
}

async function doResolveWithImages(
  cacheKey: string,
  barcode: string | null,
  fetchData: () => Promise<RawOFFProduct | null>,
  originalQuery: string,
): Promise<FitogenixProduct | null> {
  // Level 1 — Redis (fastest, in-memory cache)
  const redisHit = await getFromRedis(cacheKey);
  if (redisHit) {
    // Las entradas nuevas ya traen cacheKey serializado; reasignar acá cubre
    // también entradas viejas (pre-campo) sin costo.
    redisHit.cacheKey = cacheKey;
    logSource(cacheKey, 'redis', redisHit.dataSource);
    return redisHit;
  }

  // Level 2 — Supabase (persistent cache). Guardamos crudos → recomputamos con
  // el MISMO mapOFFToProduct que un lookup fresco, así el cacheado es idéntico.
  const cached = await getCachedProduct(cacheKey);
  if (cached) {
    const product = mapOFFToProduct(cached.raw, originalQuery);
    product.dataSource = cached.dataSource;
    product.cacheKey = cacheKey;
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
  product.cacheKey = cacheKey;
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

  // Persist to Supabase (crudos) + Redis bajo la clave unificada
  setCachedProduct(product, data, cacheKey, barcode).catch((err: unknown) =>
    console.error('[productLookupService] setCachedProduct error:', err),
  );
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
      trimmed, // cacheKey = barcode
      trimmed, // barcode
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
      cachedBarcode, // cacheKey = barcode
      cachedBarcode, // barcode
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
    // reales), lo servimos de acá y evitamos duplicarlo como fila 'name:<...>'
    // resuelta por IA con otro score. Envuelto en try/catch: si el catálogo
    // falla, la cascada sigue a la IA — nunca crashea.
    try {
      const catalogHit = await findCachedProductByName(trimmed);
      if (catalogHit) {
        const product = mapOFFToProduct(catalogHit.raw, trimmed);
        product.dataSource = catalogHit.dataSource;
        product.cacheKey = catalogHit.cacheKey;
        logSource(catalogHit.cacheKey, 'catalog', product.dataSource);
        // Poblamos Redis bajo la clave de la fila para acelerar próximos hits.
        const ttl = product.dataSource === 'ai' ? 259200 : 604800;
        setInRedis(catalogHit.cacheKey, product, ttl).catch((err: unknown) =>
          console.error('[productLookupService] setInRedis (catalog) error:', err),
        );
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

    // Sin match en OFF → producto resuelto solo por IA. No tiene barcode, así que
    // se cachea bajo cache_key = 'name:<nombre normalizado>' (barcode null). En la
    // próxima búsqueda idéntica lo sirve getCachedProduct y NO se vuelve a pedir IA.
    // fetchData devuelve null a propósito → doResolveWithImages cae al aiLookup.
    return resolveWithImages(
      nameKey(trimmed), // cacheKey
      null, // sin barcode
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
    resolved.code, // cacheKey = barcode
    resolved.code, // barcode
    () => completeResolvedMatch(resolved.code, resolved.fields),
    trimmed,
  );
}
