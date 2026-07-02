import {
  extractCategory,
  extractNutrition,
  ftgAnalyzeIngredients,
  ftgScoreWithBreakdown,
} from '../domain/product/ftgEngine';
import { getScoreLabel, getScoreTagline } from '../domain/product/scoring';
import { resolveProductStatus } from '../domain/product/productService';
import { aiLookupProduct, enrichWithAI } from './claudeService';
import { getCachedProduct, setCachedProduct } from './cacheService';
import { getFromRedis, setInRedis } from './redisService';
import {
  OffServiceUnavailableError,
  completeResolvedMatch,
  fetchProductByBarcode,
  resolveQueryToCode,
} from './offService';
import { fetchRetailerImage, fetchSearchImageUrl } from './imageService';
import type { FitogenixProduct, RawOFFProduct } from '../types/fitogenix';

const EMPTY_NUTRITION = {
  calories: null, protein: null, carbs: null, sugars: null,
  fats: null, satFats: null, sodium: null, fiber: null,
  transFat: null, cholesterol: null,
};

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

function mapOFFToProduct(off: RawOFFProduct, query: string): FitogenixProduct {
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
    aiEnriched: off._aiEnriched,
    ...scorePresentation(breakdown.score),
  };
}

function mapCacheToProduct(cached: NonNullable<Awaited<ReturnType<typeof getCachedProduct>>>): FitogenixProduct {
  return {
    id: cached.id,
    name: cached.name,
    subtitle: null,
    brand: cached.brand ?? '',
    category: cached.category ?? 'Alimento',
    categoryEmoji: '🍽️',
    score: cached.score,
    flagged: cached.score < 40,
    emoji: '📦',
    bgColor: '#f8faf7',
    imageUrl: (cached.imageUrl as string | null) ?? null,
    summary: null,
    ingredients: (cached.ingredients as FitogenixProduct['ingredients']) ?? [],
    nutrition: (cached.nutrition as FitogenixProduct['nutrition']) ?? EMPTY_NUTRITION,
    subscores: { toxicidad: 0, nutricion: 0, procesamiento: 0, alineacion: 0 },
    breakdown: null,
    alternatives: cached.alternatives ?? [],
    dataSource: cached.dataSource ?? 'off',
    ...scorePresentation(cached.score),
  };
}

async function resolveWithImages(
  code: string,
  fetchData: () => Promise<RawOFFProduct | null>,
  originalQuery: string,
): Promise<FitogenixProduct | null> {
  // Level 1 — Redis (fastest, in-memory cache)
  const redisHit = await getFromRedis(code);
  if (redisHit) return redisHit;

  // Level 2 — Supabase (persistent cache)
  const cached = await getCachedProduct(code);
  if (cached) {
    const product = mapCacheToProduct(cached);
    // Populate Redis so next hit is faster; use shorter TTL if AI-sourced
    const ttl = product.dataSource === 'ai' ? 259200 : 604800;
    setInRedis(code, product, ttl).catch((err: unknown) =>
      console.error('[productLookupService] setInRedis error:', err),
    );
    return product;
  }

  // Level 3 — OFF + Claude (cold path)
  const retailerPromise = fetchRetailerImage(code);

  let data = await fetchData();
  if (data) {
    data = await enrichWithAI(data);
  } else {
    const ai = await aiLookupProduct(originalQuery);
    if (!ai) return null;
    data = await enrichWithAI(ai);
  }

  const product = mapOFFToProduct(data, code);

  const retailerImage = await retailerPromise;
  if (!product.imageUrl && retailerImage) product.imageUrl = retailerImage;
  if (!product.imageUrl) {
    const searchImage = await fetchSearchImageUrl(product.name, product.brand);
    if (searchImage) product.imageUrl = searchImage;
  }

  // Persist to Supabase + Redis
  setCachedProduct(product, code).catch((err: unknown) =>
    console.error('[productLookupService] setCachedProduct error:', err),
  );
  const ttl = product.dataSource === 'ai' ? 259200 : 604800;
  setInRedis(code, product, ttl).catch((err: unknown) =>
    console.error('[productLookupService] setInRedis (cold) error:', err),
  );

  return product;
}

export async function lookupProduct(query: string): Promise<FitogenixProduct | null> {
  const trimmed = String(query).trim();
  const isBarcode = /^\d{8,14}$/.test(trimmed);

  if (isBarcode) {
    return resolveWithImages(
      trimmed,
      () => fetchProductByBarcode(trimmed),
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
    const ai = await aiLookupProduct(trimmed);
    if (!ai) return null;
    const enriched = await enrichWithAI(ai);
    const product = mapOFFToProduct(enriched, trimmed);
    if (!product.imageUrl) {
      const img = await fetchSearchImageUrl(product.name, product.brand);
      if (img) product.imageUrl = img;
    }
    return product;
  }

  return resolveWithImages(
    resolved.code,
    () => completeResolvedMatch(resolved.code, resolved.fields),
    trimmed,
  );
}
