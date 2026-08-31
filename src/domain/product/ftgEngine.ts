/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Fachada del motor de puntuación

   El motor vive en `./scoring/`, una carpeta por responsabilidad. Este
   archivo existe por dos motivos:

   1. Es el punto de entrada estable. Los servicios, las rutas y los scripts
      de curaduría importan de acá, así que reorganizar el interior del motor
      no obliga a tocar nada de afuera.
   2. Guarda las utilidades que NO son puntuación pero que el pipeline de
      producto necesita del mismo módulo: extraer el panel nutricional y la
      categoría de un producto crudo.

   No hay lógica de scoring en este archivo. Si aparece alguna, va a
   `./scoring/`.
═══════════════════════════════════════════════════════════ */

import { analyzeIngredients, scoreProduct } from './scoring/index';
import type { AnalyzedIngredient, NutritionFacts, ProductInput, ScoreBreakdown } from './scoring/index';

export { ENGINE_VERSION } from './scoring/index';

export type {
  AnalyzedIngredient,
  Ceiling,
  Impact,
  NoScore,
  NoScoreCode,
  NutritionFacts,
  ProcessingVerdict,
  ProductInput,
  ScoreBreakdown,
  ScoreStep,
  ScoreStepKind,
  Severity,
  Tier,
  WarningSeal,
} from './scoring/index';

/** Compatibilidad: el motor v2 exponía la severidad con este nombre. */
export type { Severity as SeverityLevel } from './scoring/index';

/**
 * Un producto → su puntaje y el desglose que lo explica.
 *
 * `score` es `null` cuando §1 dice que no se puntúa. Nunca un número
 * estimado: "la ausencia de datos nunca mejora un puntaje".
 */
export function ftgScoreWithBreakdown(product: ProductInput): ScoreBreakdown {
  return scoreProduct(product);
}

/** El puntaje solo, para los llamadores que no necesitan el desglose. */
export function ftgScore(product: ProductInput): number | null {
  return scoreProduct(product).score;
}

/**
 * Los ingredientes analizados, en el orden de la etiqueta (§7).
 *
 * Sale del mismo cálculo que el puntaje: en v2.1 la posición de cada
 * ingrediente y su resta son parte del resultado, así que recalcularlos por
 * separado podría producir una lista que no le corresponde al número que se
 * está mostrando.
 */
export function ftgAnalyzeIngredients(product: ProductInput): readonly AnalyzedIngredient[] {
  return analyzeIngredients(product);
}

/* ────────────────────────────────────────────────────────────
   Utilidades de producto (no son scoring)
   ──────────────────────────────────────────────────────────── */

/** Cuenta rápida de ingredientes declarados. Sirve para decidir si vale la
 *  pena pedir más datos, no para puntuar. */
export function ingredientCount(text?: string): number {
  if (!text || text.trim().length < 3) return 0;
  return text.split(/[,;]/).filter((part) => part.trim().length > 1).length;
}

const EMPTY_NUTRITION: NutritionFacts = {
  calories: null, protein: null, carbs: null, sugars: null, fats: null,
  satFats: null, sodium: null, fiber: null, transFat: null, cholesterol: null,
};

/** El panel nutricional crudo → la forma que consume la app. */
export function extractNutrition(nutriments?: Record<string, unknown>): NutritionFacts {
  if (!nutriments) return EMPTY_NUTRITION;

  const read = (key: string): number | null => {
    const raw = nutriments[`${key}_100g`] ?? nutriments[key];
    if (raw == null || Number.isNaN(Number(raw))) return null;
    return Math.round(parseFloat(String(raw)) * 10) / 10;
  };
  const toMilligrams = (value: number | null) => (value != null ? Math.round(value * 1000) : null);

  return {
    calories: read('energy-kcal'),
    protein: read('proteins'),
    carbs: read('carbohydrates'),
    sugars: read('sugars'),
    fats: read('fat'),
    satFats: read('saturated-fat'),
    sodium: toMilligrams(read('sodium')),
    fiber: read('fiber'),
    transFat: read('trans-fat'),
    cholesterol: toMilligrams(read('cholesterol')),
  };
}

/** La categoría más corta y legible de la lista jerárquica que traen las
 *  fuentes ("en:snacks,en:sweet-snacks,..."). */
export function extractCategory(categories?: string): string {
  if (!categories) return 'Alimento';

  const parts = categories.split(',').map((part) => part.trim());
  const shortest = parts.find((part) => part.split(':').pop()!.length < 30);
  if (!shortest) return parts[0] || 'Alimento';

  return shortest
    .split(':')
    .pop()!
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
