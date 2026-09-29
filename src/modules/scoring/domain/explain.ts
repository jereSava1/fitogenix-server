/* ═══════════════════════════════════════════════════════════
   FITOGENIX — §7: qué ve el usuario

   El armado de la salida legible. Está separado del cálculo a propósito: acá
   no se decide ningún número, solo cómo se cuenta lo que ya se decidió.

   Las prohibiciones de §7 valen para todo lo que se escriba en este archivo:

   · ninguna cita a un organismo, año, estudio o cifra que no esté escrita en
     la rúbrica para ese ingrediente;
   · nunca decir de dónde salen los datos ni en qué idioma estaban;
   · "se asocia con", nunca "causa"; nada de "tóxico" ni "cancerígeno" sobre
     un producto concreto;
   · la frase de la mirada Fitogenix tiene que ser específica a ESTE producto.
     Una frase genérica es peor que ninguna.
═══════════════════════════════════════════════════════════ */

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

/**
 * Un ingrediente evaluado → la forma que consume la UI, con su resta a la
 * vista para que el usuario pueda seguir la cuenta ingrediente por ingrediente.
 *
 * `deducted` dice si la cuenta por ingrediente EFECTIVAMENTE corrió. En un
 * producto con ancla (§3) o con anulación (§5) el puntaje no sale de sumar
 * restas, así que mostrar "−13" al lado del azúcar sería mostrar un número que
 * nadie aplicó. La lista se sigue mostrando entera —§7 la pide— pero sin una
 * cuenta que no existió.
 */
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

/**
 * Una frase, en orden de importancia: primero lo que anula, después lo que no
 * pudimos leer, después lo peor que sí leímos.
 */
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

/**
 * Fracción de ingredientes que el motor supo identificar.
 *
 * Un puntaje calculado sobre 2 ingredientes reconocidos de 12 no vale lo mismo
 * que uno calculado sobre 12 de 12. Exponerlo permite que la UI module el
 * mensaje en vez de aparentar una precisión que no tenemos.
 */
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

/**
 * §1 — El resultado cuando NO se puntúa.
 *
 * `score: null`, no un número conservador: el consumidor tiene que poder
 * distinguir "no sabemos" de "sabemos y es mediocre". La cola de curaduría y
 * las advertencias de la etiqueta se devuelven igual, porque son información
 * verdadera aunque no haya puntaje.
 */
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
