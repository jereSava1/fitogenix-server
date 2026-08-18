import {
  extractCategory,
  extractNutrition,
  ftgScoreWithBreakdown,
} from '../domain/product/ftgEngine';
import { getScoreLabel, getScoreTagline } from '../domain/product/scoring';
import { resolveProductStatus } from '../domain/product/productService';
import { findCachedProductByName, getCachedProductByBarcode } from './cacheService';
import { normalizeQuery } from './queryNormalization';
import {
  getFromRedis,
  getSearchBarcode,
  setInRedis,
  setSearchBarcode,
} from './redisService';
import type { FitogenixProduct, RawOFFProduct } from '../types/fitogenix';

/**
 * Búsqueda de productos — SOLO catálogo propio (decisión de producto,
 * 2026-08-18, ver BITACORA_DECISIONES.md).
 *
 * Hasta acá había una cascada completa (OFF search → OFF por código → Open
 * Beauty Facts → Edamam → Claude) para cuando el catálogo no tenía el
 * producto. Con el catálogo ahora poblado por el ETL a un volumen mucho
 * mayor, esa cascada dejó de ser necesaria como camino de resolución en vivo:
 * agregaba varios round-trips de red secuenciales (era la causa principal de
 * que una búsqueda "en frío" tardara segundos) y duplicaba trabajo que el ETL
 * ya hace en batch, con curaduría y sin la presión de una request HTTP
 * esperando la respuesta.
 *
 * El resultado: este archivo ahora es un camino de SOLO LECTURA contra
 * Supabase (con Redis como capa caliente adelante). Si un producto no está en
 * el catálogo, `lookupProduct` devuelve `null` — la ruta responde que
 * todavía no lo tenemos, sin intentar resolverlo con proveedores externos. El
 * catálogo crece por el ETL (`scripts/etl/`), no por el tráfico de búsqueda.
 *
 * offService/claudeService/openBeautyFactsApi/fallbackFoodApi/imageService
 * NO se tocaron: el ETL los sigue usando para poblar el catálogo en batch.
 */

type LookupSource = 'redis' | 'supabase' | 'catalog';

// `source` = nivel que sirvió ESTA request (redis/supabase = barcode exacto;
// catalog = búsqueda por nombre). `dataSource` = proveedor ORIGINAL del dato
// (off/obf/edamam/ai), preservado desde que el ETL lo cargó — sigue siendo
// útil para analítica de origen aunque ya no se resuelva en vivo.
function logSource(cacheKey: string, source: LookupSource, dataSource: string): void {
  console.info(JSON.stringify({ event: 'product_lookup', cacheKey, source, dataSource }));
}

// Clave INTERNA (Redis/in-flight/logs) para búsquedas por nombre. Normaliza
// (minúsculas, sin acentos, espacios colapsados) para maximizar hits entre
// búsquedas equivalentes, y prefija 'name:' para no colisionar con barcodes.
function nameKey(query: string): string {
  return `name:${normalizeQuery(query)}`;
}

// Presentación derivada del score — única fuente de verdad de los umbrales.
// El cliente consume estos campos en vez de recalcularlos.
//
// `score: null` es un estado de primera clase desde v2.1: §1 del documento
// enumera los casos en que NO se emite puntaje, y "la ausencia de datos nunca
// mejora un puntaje".
function scorePresentation(score: number | null): Pick<
  FitogenixProduct,
  'scoreLabel' | 'scoreColor' | 'tagline' | 'fito'
> {
  const { label, color } = getScoreLabel(score);
  if (score == null) {
    return { scoreLabel: label, scoreColor: color, tagline: getScoreTagline(score), fito: 'none' };
  }
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
export function mapRawToProduct(off: RawOFFProduct, query: string): FitogenixProduct {
  const breakdown = ftgScoreWithBreakdown(off);
  // Los ingredientes salen del MISMO breakdown, no de una segunda pasada: en
  // v2.1 la posición de cada ingrediente y su resta son parte del cálculo, así
  // que recalcularlos aparte podría dar una lista que no corresponde al
  // puntaje que se está mostrando.
  const ingredients = breakdown.ingredients;
  const nutrition = extractNutrition(off.nutriments);

  return {
    id: query,
    name: cleanName(off.product_name, String(query)),
    subtitle: off.quantity ?? null,
    brand: off.brands ?? '',
    category: extractCategory(off.categories),
    categoryEmoji: '🍽️',
    score: breakdown.score,
    scoreAvailable: breakdown.scoreAvailable,
    noScore: breakdown.noScore,
    flagged: breakdown.score != null && breakdown.score < 40,
    emoji: '📦',
    bgColor: '#f8faf7',
    imageUrl: off.image_front_url ?? off.image_url ?? null,
    ingredients,
    nutrition,
    // `breakdown` NO se adjunta a la respuesta (decisión de producto,
    // 2026-08-18) — ver la nota en types/fitogenix.ts.
    dataSource: off._aiSource ? 'ai' : 'off',
    // Default para tipar; los resolutores la pisan con el id real de la fila
    // en `products` (del hit de cache o del catálogo).
    productId: '',
    aiEnriched: off._aiEnriched,
    ...scorePresentation(breakdown.score),
  };
}

// Deduplicación in-flight (singleflight): si varias requests piden la misma
// clave a la vez, comparten una sola resolución en curso. Keyed por la clave
// interna de proceso (barcode o 'name:<...>').
const inFlight = new Map<string, Promise<FitogenixProduct | null>>();

async function withSingleflight(
  cacheKey: string,
  resolve: () => Promise<FitogenixProduct | null>,
): Promise<FitogenixProduct | null> {
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = resolve().finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, promise);
  return promise;
}

async function resolveByBarcode(
  barcode: string,
  originalQuery: string,
): Promise<FitogenixProduct | null> {
  return withSingleflight(barcode, async () => {
    // Level 1 — Redis (fastest, in-memory cache).
    const redisHit = await getFromRedis(barcode);
    // Entradas viejas (pre-migración 006) no traen productId serializado: sin
    // él el cliente no puede guardar el producto, así que se tratan como miss
    // y Supabase las repobla con el campo nuevo.
    if (redisHit && typeof redisHit.productId === 'string' && redisHit.productId) {
      logSource(barcode, 'redis', redisHit.dataSource);
      return redisHit;
    }

    // Level 2 — Supabase (catálogo). Único nivel de resolución: si no está
    // acá, no está — no hay cascada externa (ver docstring del archivo).
    const cached = await getCachedProductByBarcode(barcode);
    if (!cached) return null;

    const product = mapRawToProduct(cached.raw, originalQuery);
    product.dataSource = cached.dataSource;
    product.productId = cached.productId;
    logSource(barcode, 'supabase', product.dataSource);

    const ttl = product.dataSource === 'ai' ? 259200 : 604800;
    setInRedis(barcode, product, ttl).catch((err: unknown) =>
      console.error('[productLookupService] setInRedis error:', err),
    );

    return product;
  });
}

async function resolveByName(trimmed: string): Promise<FitogenixProduct | null> {
  const cacheKey = nameKey(trimmed);

  return withSingleflight(cacheKey, async () => {
    // Level 1 — Redis, bajo la clave de ESTA query textual.
    const redisHit = await getFromRedis(cacheKey);
    if (redisHit && typeof redisHit.productId === 'string' && redisHit.productId) {
      logSource(cacheKey, 'redis', redisHit.dataSource);
      return redisHit;
    }

    // Level 2 — búsqueda por nombre en el catálogo (índice trigram + ranking
    // por similitud, ver migración 014). Único nivel de resolución para
    // texto: sin match acá, el producto todavía no está en el catálogo.
    const cached = await findCachedProductByName(trimmed);
    if (!cached) return null;

    const product = mapRawToProduct(cached.raw, trimmed);
    product.dataSource = cached.dataSource;
    product.productId = cached.productId;
    logSource(cacheKey, 'catalog', product.dataSource);

    if (cached.barcode) {
      // La fila tiene barcode: la próxima vez que alguien busque este mismo
      // texto, resolveByBarcode la sirve directo desde Redis/Supabase por
      // barcode — no hace falta cachear el producto bajo la clave de texto
      // también (sería una segunda copia que nadie vuelve a leer).
      setSearchBarcode(trimmed, cached.barcode).catch((err: unknown) =>
        console.error('[productLookupService] setSearchBarcode error:', err),
      );
    } else {
      // Fila solo-nombre (sin barcode, típicamente resuelta por IA en su
      // momento): la única forma de encontrarla rápido de nuevo es cachear
      // bajo la clave de ESTA query.
      const ttl = product.dataSource === 'ai' ? 259200 : 604800;
      setInRedis(cacheKey, product, ttl).catch((err: unknown) =>
        console.error('[productLookupService] setInRedis error:', err),
      );
    }

    return product;
  });
}

export async function lookupProduct(query: string): Promise<FitogenixProduct | null> {
  const trimmed = String(query).trim();
  const isBarcode = /^\d{8,14}$/.test(trimmed);

  if (isBarcode) {
    return resolveByBarcode(trimmed, trimmed);
  }

  // Si otra búsqueda ya resolvió esta query a un barcode, saltamos derecho a
  // ese camino (Redis/Supabase por barcode) en vez de repetir la búsqueda por
  // nombre.
  const cachedBarcode = await getSearchBarcode(trimmed);
  if (cachedBarcode) {
    return resolveByBarcode(cachedBarcode, trimmed);
  }

  return resolveByName(trimmed);
}
