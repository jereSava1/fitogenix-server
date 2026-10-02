// §7: cómo se cuenta lo que ya se calculó (acá no se decide ningún número). Sin citar
// organismos ni cifras fuera de la rúbrica, sin decir de dónde salen los datos, "se asocia
// con" y nunca "causa".

import { severityOf } from './classify';
import { CONFIDENCE, DISCLAIMER, ENGINE_VERSION, NO_DATA_TIER, TIERS } from './constants';
import { OPACITY_NOTE } from './rubric';
import { deductionFor } from './steps';
import { unique } from './text';
import type {
  AnalyzedIngredient,
  Anchor,
  Ceiling,
  EvaluatedIngredient,
  NoScore,
  ProcessingVerdict,
  ScoreBreakdown,
  ScoreStep,
  TierDefinition,
  WarningSeal,
} from './types';

/** El puntaje determina la banda, nunca al revés. */
export function tierFor(score: number): TierDefinition {
  return TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1];
}

/* ────────────────────────────────────────────────────────────
   Ingredientes
   ──────────────────────────────────────────────────────────── */

/** Ingrediente evaluado → forma de la UI, con su resta. Con ancla (§3) o anulación (§5)
 *  la cuenta por ingrediente no corrió (`deducted`): la lista se muestra sin restas. */
export function toAnalyzed(ingredient: EvaluatedIngredient, deducted: boolean): AnalyzedIngredient {
  return {
    name: ingredient.display,
    position: ingredient.item.position,
    impact: ingredient.impact,
    delta: deducted ? deductionFor(ingredient) : 0,
    sev: severityOf(ingredient.impact),
    desc: ingredient.desc,
    // Lo que hay que mirar dos veces: lo peor y lo que no pudimos leer.
    flag: ingredient.impact === 'alto' || ingredient.impact === 'desconocido',
    marker: ingredient.marker,
    ...(ingredient.item.percent != null ? { percent: ingredient.item.percent } : {}),
    ...(ingredient.detail ? { detail: ingredient.detail } : {}),
  };
}

/* ────────────────────────────────────────────────────────────
   "Desde la mirada Fitogenix"
   ──────────────────────────────────────────────────────────── */

const lower = (ingredients: readonly EvaluatedIngredient[], n: number): string =>
  ingredients.slice(0, n).map((i) => i.display.toLowerCase()).join(', ');

export interface ViewSubject {
  readonly ingredients: readonly EvaluatedIngredient[];
  readonly annulments: readonly string[];
  readonly anchor: Anchor | null;
  readonly score: number;
}

/** Una frase, por importancia: lo que anula, lo que no se pudo leer, lo peor que se leyó. */
export function fitogenixView(subject: ViewSubject): string {
  const { ingredients, annulments, anchor, score } = subject;
  const prefix = 'Desde la mirada Fitogenix:';

  if (annulments.length > 0) return `${prefix} ${annulments[0]}`;

  const unknown = ingredients.filter((i) => !i.known);
  if (unknown.length > 0) {
    const names = unknown.map((u) => `"${u.item.raw}"`).join(' ni ');
    return `${prefix} la etiqueta no dice qué es ${names}. ${OPACITY_NOTE}`;
  }

  const high = ingredients.filter((i) => i.impact === 'alto');
  if (high.length > 0) {
    return `${prefix} contiene ${lower(high, 3)} — no alineado con alimentación integral.`;
  }

  if (anchor) return `${prefix} ${anchor.label.toLowerCase()} — un alimento, no una formulación.`;

  const medium = ingredients.filter((i) => i.impact === 'medio');
  if (medium.length > 0) {
    const plural = medium.length === 1 ? '' : 's';
    return `${prefix} alimento real con ${lower(medium, 3)} agregado${plural} en la formulación.`;
  }

  return score >= TIERS[0].min
    ? `${prefix} ingredientes de alimentación real y mínimamente procesada.`
    : `${prefix} sin ingredientes problemáticos, pero tampoco es un alimento entero.`;
}

/* ────────────────────────────────────────────────────────────
   Cobertura
   ──────────────────────────────────────────────────────────── */

export interface Coverage {
  readonly ratio: number;
  readonly confidence: 'alta' | 'media' | 'baja';
}

/** Fracción de ingredientes identificados: un puntaje sobre 2 de 12 no vale lo que uno sobre
 *  12 de 12. */
export function coverageOf(ingredients: readonly EvaluatedIngredient[]): Coverage {
  if (ingredients.length === 0) return { ratio: 0, confidence: 'baja' };

  const ratio = ingredients.filter((i) => i.known).length / ingredients.length;
  const confidence = ratio >= CONFIDENCE.high ? 'alta' : ratio >= CONFIDENCE.medium ? 'media' : 'baja';
  return { ratio: Math.round(ratio * 100) / 100, confidence };
}

/* ────────────────────────────────────────────────────────────
   Armado del resultado
   ──────────────────────────────────────────────────────────── */

export interface BreakdownInput {
  readonly score: number;
  readonly steps: readonly ScoreStep[];
  readonly ingredients: readonly EvaluatedIngredient[];
  readonly processing: ProcessingVerdict;
  readonly annulments: readonly string[];
  readonly ceiling: Ceiling | null;
  readonly anchor: Anchor | null;
  readonly seals: readonly WarningSeal[];
  readonly allergenWarnings: readonly string[];
  readonly notices: readonly string[];
}

export function buildBreakdown(input: BreakdownInput): ScoreBreakdown {
  const tier = tierFor(input.score);
  const coverage = coverageOf(input.ingredients);
  // La cuenta por ingrediente solo corrió en el camino compuesto.
  const deducted = input.anchor == null && input.annulments.length === 0;

  return {
    engineVersion: ENGINE_VERSION,
    score: input.score,
    scoreAvailable: true,
    noScore: null,

    tier: tier.tier,
    tierColor: tier.color,
    tierMessage: tier.message,

    steps: input.steps,
    ingredients: input.ingredients.map((i) => toAnalyzed(i, deducted)),

    // §7 — "Omitir si no hay nada que decir." Un producto que salió de un ancla
    // no tiene procesamiento del que hablar: es un alimento.
    processing: input.anchor ? { ...input.processing, text: '' } : input.processing,

    fitogenixView: fitogenixView({
      ingredients: input.ingredients,
      annulments: input.annulments,
      anchor: input.anchor,
      score: input.score,
    }),

    annulments: input.annulments,
    ceiling: input.ceiling,

    warnings: input.seals,
    allergenWarnings: input.allergenWarnings,
    notices: unique(input.notices),
    unidentified: input.ingredients.filter((i) => !i.known).map((i) => i.item.raw),

    coverage: coverage.ratio,
    confidence: coverage.confidence,
    disclaimer: DISCLAIMER,
  };
}

/** §1: sin puntaje es `null`, nunca un número conservador ("no sabemos" ≠ "es mediocre").
 *  La cola de curaduría y las advertencias se devuelven igual. */
export function buildNoScoreBreakdown(
  noScore: NoScore,
  extras: {
    readonly ingredients?: readonly EvaluatedIngredient[];
    readonly allergenWarnings?: readonly string[];
  } = {},
): ScoreBreakdown {
  const ingredients = extras.ingredients ?? [];

  return {
    engineVersion: ENGINE_VERSION,
    score: null,
    scoreAvailable: false,
    noScore,

    tier: NO_DATA_TIER.tier,
    tierColor: NO_DATA_TIER.color,
    tierMessage: NO_DATA_TIER.message,

    steps: [],
    ingredients: ingredients.map((i) => toAnalyzed(i, false)),
    processing: { markers: [], modifier: 0, text: '' },
    fitogenixView: '',
    annulments: [],
    ceiling: null,
    warnings: [],
    allergenWarnings: extras.allergenWarnings ?? [],
    notices: [],
    unidentified: ingredients.filter((i) => !i.known).map((i) => i.item.raw),

    coverage: coverageOf(ingredients).ratio,
    confidence: 'baja',
    disclaimer: DISCLAIMER,
  };
}
