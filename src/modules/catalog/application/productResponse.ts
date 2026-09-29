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
} from '../../scoring';
import { extractCategory, extractNutrition } from '../domain/productData';
import type { FitogenixProduct, RawOFFProduct } from '../../../types/fitogenix';

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
export function mapRawToProduct(off: RawOFFProduct, query: string): FitogenixProduct {
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
    // 2026-08-18) — ver la nota en types/fitogenix.ts.
    dataSource: off._aiSource ? 'ai' : 'off',
    // Default para tipar; los resolutores la pisan con el id real de la fila
    // en `products` (del hit de cache o del catálogo).
    productId: '',
    aiEnriched: off._aiEnriched,
    ...scorePresentation(breakdown.score),
  };
}
