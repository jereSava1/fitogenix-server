// §2, un paso por función pura que devuelve un libro nuevo: restas por ingrediente (2),
// procesamiento (3), nutrición (decisión de producto) y techos (4).

import { CEILINGS, DEDUCTIONS, DOMINANCE, HEAD_POSITIONS, NUTRITION, PROCESSING } from './constants';
import { ScoreLedger } from './ledger';
import { anchorScore, negativeAnchorFor, rubricImpact } from './matching';
import { DRINK_CATEGORY_PATTERN, NATURAL_TRANS_PATTERN } from './rubric';
import { computeWarningSeals, sealPenalty } from './seals';
import type {
  Ceiling,
  EvaluatedIngredient,
  ProcessingVerdict,
  ProductInput,
  WarningSeal,
} from './types';

/* ────────────────────────────────────────────────────────────
   §2 Paso 2 — Restar por ingrediente
   ──────────────────────────────────────────────────────────── */

/** Cuánto resta un ingrediente según su impacto y su posición. Siempre ≤ 0. */
export function deductionFor(ingredient: EvaluatedIngredient): number {
  if (ingredient.mandatory) return 0; // §4.5 — la ley obliga a agregarlo
  const rates = DEDUCTIONS[ingredient.impact];
  const amount = ingredient.item.position <= HEAD_POSITIONS ? rates.first3 : rates.rest;
  return amount === 0 ? 0 : -amount;
}

function deductionDetail(ingredient: EvaluatedIngredient): string {
  if (ingredient.impact === 'desconocido') return 'No identificado';
  const head = ingredient.item.position <= HEAD_POSITIONS;
  return `Impacto ${ingredient.impact}${head ? ', entre los primeros 3 ingredientes' : ''}`;
}

/** §2 Paso 2: una fila por ingrediente que resta (los demás van en la lista de §7). */
export function applyIngredientDeductions(
  ledger: ScoreLedger,
  ingredients: readonly EvaluatedIngredient[],
): ScoreLedger {
  return ingredients.reduce(
    (acc, ingredient) =>
      acc.add(deductionFor(ingredient), {
        kind: 'ingrediente',
        label: `${ingredient.display} (posición ${ingredient.item.position})`,
        detail: deductionDetail(ingredient),
      }),
    ledger,
  );
}

/* ────────────────────────────────────────────────────────────
   §2 Paso 3 — Modificador de procesamiento
   ──────────────────────────────────────────────────────────── */

function processingModifier(markerCount: number, currentScore: number): number {
  if (markerCount >= PROCESSING.manyMarkersFrom) return PROCESSING.manyMarkers;
  if (markerCount >= 1) return PROCESSING.someMarkers;
  return currentScore >= PROCESSING.bonusThreshold ? PROCESSING.cleanBonus : 0;
}

/** §7 — Una frase sobre qué tan formulado es el producto. Vacía si no hay
 *  nada que decir. */
function processingText(markers: readonly string[]): string {
  if (markers.length === 0) return 'No encontramos marcadores de ultraprocesamiento en la lista.';
  if (markers.length >= PROCESSING.manyMarkersFrom) {
    return `Producto altamente formulado: ${markers.length} ingredientes de uso exclusivamente industrial (${markers.slice(0, 4).join(', ')}).`;
  }
  const plural = markers.length === 1 ? '' : 's';
  return `Producto formulado: usa ${markers.join(', ')}, ingrediente${plural} de uso industrial.`;
}

export interface ProcessingResult {
  readonly ledger: ScoreLedger;
  readonly verdict: ProcessingVerdict;
}

/** §2 Paso 3: cuenta cuántos marcadores hay, no cuáles. El +5 confirma una cuenta alta, no
 *  rescata una baja. */
export function applyProcessing(
  ledger: ScoreLedger,
  ingredients: readonly EvaluatedIngredient[],
): ProcessingResult {
  const markers = ingredients.filter((i) => i.marker).map((i) => i.display);
  const modifier = processingModifier(markers.length, ledger.score);

  const label = markers.length > 0
    ? `Procesamiento: ${markers.length} marcador${markers.length === 1 ? '' : 'es'} de ultraprocesado`
    : 'Procesamiento: sin marcadores de ultraprocesado';

  return {
    ledger: ledger.add(modifier, {
      kind: 'procesamiento',
      label,
      ...(markers.length > 0 ? { detail: markers.join(', ') } : {}),
    }),
    verdict: { markers, modifier, text: processingText(markers) },
  };
}

/* ────────────────────────────────────────────────────────────
   Modificador nutricional (decisión de producto, no del documento)
   ──────────────────────────────────────────────────────────── */

/** Lee un valor del panel, tolerando las dos formas en que llega. */
function nutrient(nutriments: Record<string, unknown> | undefined, key: string): number | null {
  if (!nutriments) return null;
  const raw = nutriments[`${key}_100g`] ?? nutriments[key];
  if (raw == null) return null;
  const value = parseFloat(String(raw));
  return Number.isNaN(value) ? null : value;
}

/** El listado, unido, para las reglas que miran el conjunto y no cada fila. */
function ingredientsList(ingredients: readonly EvaluatedIngredient[]): string {
  return ingredients.map((i) => i.item.raw).join(', ');
}

/** Los ids de la tabla de §4.2 cuya presencia significa azúcar AÑADIDA. */
const ADDED_SUGAR_ENTRY_IDS = new Set([
  'azucar', 'jarabes', 'maltodextrina', 'concentrado-jugo', 'azucar-datil', 'azucar-tradicional',
]);

/** El sello de azúcar exige azúcar AÑADIDA: si no, la leche y la fruta llevarían uno que en
 *  la góndola no tienen. */
function hasAddedSugar(ingredients: readonly EvaluatedIngredient[]): boolean {
  return ingredients.some((i) => {
    const id = rubricImpact(i.item.raw)?.entry.id;
    return id != null && ADDED_SUGAR_ENTRY_IDS.has(id);
  });
}

export interface NutritionResult {
  readonly ledger: ScoreLedger;
  readonly seals: readonly WarningSeal[];
}

/** El nutriente detrás de cada octógono, en lenguaje llano. Va en `steps[].detail` (texto de
 *  usuario): no puede decir "sello", "octógono" ni citar la ley (§S4). Copy provisorio. */
const SEAL_NUTRIENT: Readonly<Record<WarningSeal, string>> = {
  'EXCESO EN AZÚCARES': 'azúcares',
  'EXCESO EN GRASAS SATURADAS': 'grasas saturadas',
  'EXCESO EN GRASAS TOTALES': 'grasas totales',
  'EXCESO EN SODIO': 'sodio',
  'EXCESO EN CALORÍAS': 'calorías',
};

/** Octógonos y grasa trans declarada. Exentos los alimentos SIN nutrientes críticos
 *  AÑADIDOS: la grasa de la leche o la carne es del alimento. */
export function applyNutrition(
  ledger: ScoreLedger,
  product: ProductInput,
  ingredients: readonly EvaluatedIngredient[],
): NutritionResult {
  const nutriments = product.nutriments;
  if (!nutriments || Object.keys(nutriments).length === 0) return { ledger, seals: [] };

  // Sin nutrientes críticos añadidos no hay sellos ni penalización.
  if (ingredients.every((i) => i.impact === 'none')) return { ledger, seals: [] };

  const sodium = nutrient(nutriments, 'sodium');
  const seals = computeWarningSeals({
    kcal100: nutrient(nutriments, 'energy-kcal'),
    sugars100: nutrient(nutriments, 'sugars'),
    satFat100: nutrient(nutriments, 'saturated-fat'),
    totalFat100: nutrient(nutriments, 'fat'),
    sodiumMg100: sodium != null ? sodium * 1000 : null,
    isLiquid: DRINK_CATEGORY_PATTERN.test(product.categories ?? ''),
    hasAddedSugar: hasAddedSugar(ingredients),
  });

  const notes: string[] = [];
  let delta = -sealPenalty(seals);
  if (seals.length > 0) {
    notes.push(`Perfil nutricional desfavorable en ${seals.map((s) => SEAL_NUTRIENT[s]).join(', ')}.`);
  }

  // Grasa trans declarada en el panel (§5.1 solo la ve por ingrediente). Excepción del
  // documento: la natural de lácteos y rumiantes no anula.
  const trans = nutrient(nutriments, 'trans-fat') ?? 0;
  const isNatural = NATURAL_TRANS_PATTERN.test(ingredientsList(ingredients));
  if (trans > NUTRITION.transFatThreshold && !isNatural) {
    const severe = trans >= NUTRITION.transFatSevereFrom;
    delta -= severe ? NUTRITION.transFatSeverePenalty : NUTRITION.transFatPenalty;
    notes.push(`Grasa trans declarada (${trans} g/100 g).`);
  }

  return {
    ledger: ledger.addBounded(delta, NUTRITION.floor, {
      kind: 'nutricion',
      label: 'Panel nutricional',
      detail: notes.join(' '),
    }),
    seals,
  };
}

/* ────────────────────────────────────────────────────────────
   §2 Paso 4 — Techos
   ──────────────────────────────────────────────────────────── */

const OPACITY_CEILINGS: Readonly<Record<number, Ceiling>> = {
  1: { value: CEILINGS.soft, reason: '1 ingrediente no identificado.' },
  2: { value: CEILINGS.hard, reason: '2 ingredientes no identificados.' },
};

export interface CeilingSubject {
  readonly ingredients: readonly EvaluatedIngredient[];
  readonly isSportsSupplement: boolean;
  /** El techo que dejó §5 (cárnico curado con ascorbato), si lo hubo. */
  readonly fromAnnulments: Ceiling | null;
}

/** Todos los techos del producto. El de 74 hoy no muerde (un término opaco no pasa de 67),
 *  pero se calcula porque la UI lo muestra como límite. */
export function collectCeilings(subject: CeilingSubject): Ceiling[] {
  const ceilings: Ceiling[] = [];
  if (subject.fromAnnulments) ceilings.push(subject.fromAnnulments);

  const unknown = subject.ingredients.filter((i) => !i.known).length;
  const byOpacity = OPACITY_CEILINGS[unknown];
  if (byOpacity) ceilings.push(byOpacity);

  if (subject.isSportsSupplement) {
    ceilings.push({ value: CEILINGS.soft, reason: 'Suplemento deportivo, no alimento.' });
  }

  // §4.4 — "la proteína del producto viene mayormente de fuentes aisladas".
  // "Mayormente" se lee como: está entre los tres primeros ingredientes.
  const isolatedFirst = subject.ingredients.some(
    (i) => i.isolatedProtein && i.item.position <= HEAD_POSITIONS,
  );
  if (isolatedFirst) {
    ceilings.push({
      value: CEILINGS.soft,
      reason: 'La proteína del producto viene mayormente de fuentes aisladas o concentradas, no de alimentos enteros.',
    });
  }

  ceilings.push(...dominanceCeilings(subject.ingredients));
  return ceilings;
}

/** §3 — Un ingrediente declarado con más del 50% no deja que el producto
 *  supere su propia ancla + 10. */
function dominanceCeilings(ingredients: readonly EvaluatedIngredient[]): Ceiling[] {
  const out: Ceiling[] = [];

  for (const ingredient of ingredients) {
    if ((ingredient.item.percent ?? 0) <= DOMINANCE.thresholdPct) continue;
    const anchor = negativeAnchorFor(ingredient.item.raw);
    if (!anchor) continue;

    out.push({
      value: anchorScore(anchor) + DOMINANCE.allowance,
      reason: `${ingredient.display} es más del ${DOMINANCE.thresholdPct}% del producto: el puntaje no puede superar su ancla + ${DOMINANCE.allowance}.`,
    });
  }

  return out;
}

/** "Si aplica más de uno, vale el más bajo." */
export function lowestCeiling(ceilings: readonly Ceiling[]): Ceiling | null {
  if (ceilings.length === 0) return null;
  return ceilings.reduce((lowest, c) => (c.value < lowest.value ? c : lowest));
}
