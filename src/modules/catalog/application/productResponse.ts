/* Producto crudo → la respuesta que recibe la app (`FitogenixProduct`).
 *
 * Antes era parte de `services/productLookupService.ts`; se mudó en M-05 sin
 * cambios (docs/02-arquitectura.md §5.2 #12). La presentación del puntaje
 * sale de `scoring`; `presentScore` la absorbe en K-04.
 */

import {
  getScoreLabel,
  getScoreTagline,
  resolveProductStatus,
  scoreProduct,
  type AnalyzedIngredient,
  type NoScoreCode,
  type NutritionFacts,
} from '../../scoring';
import { extractCategory, extractNutrition } from '../domain/productData';
import type { RawProduct } from '../domain/rawProduct';

/** La respuesta de `POST /products/lookup` y de cada ítem de guardados e
 *  historial. Hasta M-09 vivía en `src/types/fitogenix.ts`; K-01 la deriva del
 *  schema del contrato y K-04 la reemplaza por `ProductDetail` / `ProductSummary`. */
export type FitogenixProduct = {
  id: string;
  name: string;
  subtitle: string | null;
  brand: string;
  category: string;
  categoryEmoji: string;

  /**
   * `null` cuando §1 del motor dice que no se puntúa: fuera de alcance, sin
   * datos suficientes, o lista que no se pudo identificar. Es un estado de
   * primera clase, no un error — la app muestra el mensaje de `noScore` en vez
   * del número. Nunca se rellena con un valor conservador: "la ausencia de
   * datos nunca mejora un puntaje".
   */
  score: number | null;
  scoreAvailable: boolean;
  noScore: { code: NoScoreCode; message: string } | null;

  flagged: boolean;
  emoji: string;
  bgColor: string;
  imageUrl: string | null;
  ingredients: readonly AnalyzedIngredient[];
  nutrition: NutritionFacts;
  // No se manda `breakdown` (decisión de producto, 2026-08-18): la cuenta
  // paso por paso es información nuestra, no del usuario B2C — la lista de
  // ingredientes con severidad ya cubre el "por qué". El motor lo sigue
  // calculando internamente (ver `scoreProduct` en `modules/scoring` / scripts de ETL y
  // auditoría), solo que ya no cruza la red.
  dataSource: string;
  aiEnriched?: boolean;
  // Identidad del producto: uuid de la fila en `products` (migración 006).
  // Es el identificador estable que el cliente usa para guardar/quitar el
  // producto en favoritos (POST/DELETE /users/me/saved).
  productId: string;
  // ── Presentación derivada del score (calculada server-side, única fuente
  // de verdad). El cliente solo renderiza estos campos, no recalcula umbrales.
  scoreLabel: string;   // 'EXCELENTE' | 'BUENO' | 'MODERADO' | 'MALO' | 'SIN DATOS SUFICIENTES'
  scoreColor: string;   // color hex del tier
  tagline: string;      // 'Lo recomendamos', etc.
  fito: 'fito' | 'nofito' | 'none';
};

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

// Exportada para reutilizarla en `productResponseFromRow` (listados de
// guardados e historial) y en el ETL: los productos guardados se recomputan
// con el MISMO mapeo que un lookup.
export function mapRawToProduct(off: RawProduct, query: string): FitogenixProduct {
  const breakdown = scoreProduct(off);
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
    // 2026-08-18) — ver la nota en el tipo FitogenixProduct, arriba.
    dataSource: off._aiSource ? 'ai' : 'off',
    // Default para tipar; los resolutores la pisan con el id real de la fila
    // en `products` (del hit de cache o del catálogo).
    productId: '',
    aiEnriched: off._aiEnriched,
    ...scorePresentation(breakdown.score),
  };
}
