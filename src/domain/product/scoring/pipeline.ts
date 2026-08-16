/* ═══════════════════════════════════════════════════════════
   FITOGENIX — §2: el pipeline

   La orquestación, y nada más. Este archivo tiene que poder leerse al lado
   del documento y seguir el mismo orden:

     §1  fuera de alcance          → no se emite puntaje
     §6  limpiar la lista
     §4  clasificar cada ingrediente
     §1.2 sin datos suficientes    → no se emite puntaje
     §5  anulaciones               → el puntaje lo fija la anulación
     §2  Paso 1  base 75, o el ancla de §3 (terminal)
         Paso 2  restar por ingrediente
         Paso 3  modificador de procesamiento
          ·      modificador nutricional (decisión de producto)
         Paso 4  techos
         Paso 5  acotar

   Toda la aritmética pasa por `ScoreLedger`, así que no hay forma de mover el
   puntaje sin dejar la fila que lo explica.
═══════════════════════════════════════════════════════════ */

import { classifyIngredient, resolvesToSomething } from './classify';
import { cleanIngredientList } from './cleaning';
import { ANNULMENT, BASE_SCORE, HEAD_POSITIONS } from './constants';
import { buildBreakdown, buildNoScoreBreakdown } from './explain';
import {
  detectAnnulments,
  detectInsufficientData,
  detectNonFood,
  detectOutOfScope,
  type AnnulmentSubject,
} from './gates';
import { ScoreLedger } from './ledger';
import { findAdditive } from './catalog';
import { matchAnchor, rubricImpact } from './matching';
import { AND_OR_NOTICE, SPORTS_SUPPLEMENT_NOTICE, SPORTS_SUPPLEMENT_PATTERN } from './rubric';
import {
  applyIngredientDeductions,
  applyNutrition,
  applyProcessing,
  collectCeilings,
  lowestCeiling,
} from './steps';
import { normalizeText } from './text';
import type {
  AnalyzedIngredient,
  Anchor,
  CleanIngredient,
  EvaluatedIngredient,
  ProcessingVerdict,
  ProductInput,
  ScoreBreakdown,
} from './types';

/* ────────────────────────────────────────────────────────────
   Contexto: todo lo que el pipeline necesita, calculado una vez
   ──────────────────────────────────────────────────────────── */

interface ScoringContext {
  readonly productName: string;
  readonly categories: string;
  /** La lista limpia, unida — es sobre esto que corren §1.1 y §5, nunca sobre
   *  el texto crudo: una traza no puede anular nada. */
  readonly listText: string;
  readonly items: readonly CleanIngredient[];
  readonly ingredients: readonly EvaluatedIngredient[];
  readonly allergenWarnings: readonly string[];
  readonly certificationsRemoved: readonly string[];
  readonly additiveTags: ReadonlySet<string>;
  readonly declaredSugars: number | undefined;
  readonly isSportsSupplement: boolean;
}

const EMPTY_PROCESSING: ProcessingVerdict = { markers: [], modifier: 0, text: '' };

/**
 * Aditivos declarados por la base de datos que no aparecieron en el texto.
 *
 * Es el dato más confiable que tenemos —ya viene normalizado a `en:e150d`,
 * inmune a la calidad del OCR— así que entra al puntaje. Pero entra SIEMPRE en
 * posición ≥4: las tres primeras posiciones son las que la etiqueta declara
 * por orden de peso, y un aditivo que la etiqueta no nombró no puede reclamar
 * una de ellas. Así la aritmética de §8, que se calcula solo sobre el
 * rotulado, sigue dando exacto.
 */
function additivesFromTags(
  tags: readonly string[],
  fromLabel: readonly EvaluatedIngredient[],
): EvaluatedIngredient[] {
  const alreadyOnLabel = (code: string, name: string | undefined) =>
    fromLabel.some((t) => {
      const haystack = `${normalizeText(t.item.raw)} ${normalizeText(t.display)}`;
      return haystack.includes(code) || (name != null && haystack.includes(normalizeText(name)));
    });

  const out: EvaluatedIngredient[] = [];

  for (const tag of tags) {
    const code = tag.replace(/^en:/, '');
    const known = findAdditive(tag);
    if (alreadyOnLabel(code, known?.name)) continue;

    const raw = known?.name ?? code.toUpperCase();
    const byRubric = rubricImpact(code);

    out.push({
      item: {
        raw,
        key: normalizeText(raw),
        position: Math.max(HEAD_POSITIONS + 1, fromLabel.length + out.length + 1),
      },
      display: raw,
      // Que la base lo liste ya prueba que es un aditivo industrial: nunca cae
      // a 'none' ni a 'desconocido'.
      impact: byRubric?.impact ?? 'medio',
      marker: byRubric?.marker ?? false,
      known: true,
      desc: known?.desc ?? byRubric?.entry.desc ?? 'Aditivo declarado en la ficha del producto.',
      detail: 'Aditivo alimentario',
      isolatedProtein: false,
      mandatory: false,
    });
  }

  return out;
}

function buildContext(product: ProductInput): ScoringContext {
  const categories = product.categories ?? '';
  const productName = product.product_name ?? '';

  const cleaned = cleanIngredientList(product.ingredients_text, resolvesToSomething);
  const fromLabel = cleaned.items.map(classifyIngredient);
  const tags = product.additives_tags ?? [];

  const listText = cleaned.items.map((i) => i.raw).join(', ');
  const declaredSugars = product.nutriments
    ? (parseFloat(String(product.nutriments['sugars_100g'] ?? product.nutriments['sugars'] ?? '')) || undefined)
    : undefined;

  return {
    productName,
    categories,
    listText,
    items: cleaned.items,
    ingredients: [...fromLabel, ...additivesFromTags(tags, fromLabel)],
    allergenWarnings: cleaned.allergenWarnings,
    certificationsRemoved: cleaned.certificationsRemoved,
    additiveTags: new Set(tags),
    declaredSugars,
    isSportsSupplement:
      SPORTS_SUPPLEMENT_PATTERN.test(`${productName} ${categories}`) ||
      SPORTS_SUPPLEMENT_PATTERN.test(listText),
  };
}

/** §6.4 y §1.3 — los avisos que el documento marca como obligatorios. */
function noticesFor(ctx: ScoringContext): string[] {
  const notices: string[] = [];
  for (const ingredient of ctx.ingredients) {
    if (ingredient.item.alternatives) notices.push(AND_OR_NOTICE(ingredient.item.alternatives));
  }
  if (ctx.isSportsSupplement) notices.push(SPORTS_SUPPLEMENT_NOTICE);
  return notices;
}

function annulmentSubject(ctx: ScoringContext): AnnulmentSubject {
  return {
    listText: ctx.listText,
    categories: ctx.categories,
    productName: ctx.productName,
    additiveTags: ctx.additiveTags,
  };
}

/* ────────────────────────────────────────────────────────────
   §5 — El camino de la anulación
   ──────────────────────────────────────────────────────────── */

/**
 * `Puntaje = 20 − (6 × cantidad de anulaciones)`, piso 0, `−4` si el producto
 * va dirigido a niños. No hay aritmética de ingredientes: la anulación
 * reemplaza la cuenta entera.
 */
function scoreAsAnnulled(
  ctx: ScoringContext,
  reasons: readonly string[],
  isChildren: boolean,
  notices: readonly string[],
): ScoreBreakdown {
  const base = ANNULMENT.base - ANNULMENT.perGate * reasons.length;

  let ledger = ScoreLedger.openAt(Math.max(0, base), {
    kind: 'anulacion',
    label: `Anulación × ${reasons.length}`,
    detail: reasons.join(' '),
  });

  if (isChildren) {
    ledger = ledger.setTo(Math.max(0, base - ANNULMENT.childrenExtra), {
      kind: 'anulacion',
      label: 'Producto dirigido a niños',
      detail: `El documento resta ${ANNULMENT.childrenExtra} puntos adicionales.`,
    });
  }

  ledger = ledger.close();

  return buildBreakdown({
    score: ledger.score,
    steps: ledger.steps,
    ingredients: ctx.ingredients,
    processing: EMPTY_PROCESSING,
    annulments: reasons,
    ceiling: null,
    anchor: null,
    seals: [],
    allergenWarnings: ctx.allergenWarnings,
    notices,
  });
}

/* ────────────────────────────────────────────────────────────
   §2 — El camino normal
   ──────────────────────────────────────────────────────────── */

interface OpeningMove {
  readonly ledger: ScoreLedger;
  readonly anchor: Anchor | null;
}

/**
 * §2 Paso 1 — El ancla, o la base.
 *
 * El ancla se evalúa sobre la lista COMPLETA (etiqueta + aditivos que declara
 * la base), no solo sobre el rotulado: un aditivo que la ficha declara y la
 * etiqueta no invalida el ancla igual que si estuviera escrito. "Un
 * ingrediente extra invalida el ancla."
 */
function openLedger(ctx: ScoringContext): OpeningMove {
  const names = ctx.ingredients.map((i) => i.item.raw);
  const match = matchAnchor(names, ctx.categories, ctx.declaredSugars);

  if (!match) {
    return {
      ledger: ScoreLedger.openAt(BASE_SCORE, { kind: 'base', label: 'Punto de partida' }),
      anchor: null,
    };
  }

  const { anchor } = match;
  return {
    anchor,
    ledger: ScoreLedger.openAt(match.score, {
      kind: 'ancla',
      label: `Ancla: ${anchor.label}`,
      detail: `Rango del documento ${anchor.min}-${anchor.max}; se usa el punto medio para que el mismo producto dé siempre el mismo puntaje.`,
    }),
  };
}

/* ────────────────────────────────────────────────────────────
   Entrada principal
   ──────────────────────────────────────────────────────────── */

/**
 * Un producto → su puntaje y el desglose que lo explica.
 *
 * Determinista y sin efectos: el mismo input da siempre el mismo output.
 */
export function scoreProduct(product: ProductInput): ScoreBreakdown {
  // ── §1.1 — Fuera de alcance, antes de cualquier cálculo ──
  const outOfScope = detectOutOfScope({
    productName: product.product_name ?? '',
    categories: product.categories ?? '',
    ingredientsText: product.ingredients_text ?? '',
  });
  if (outOfScope) return buildNoScoreBreakdown(outOfScope);

  const ctx = buildContext(product);

  const nonFood = detectNonFood(ctx.listText);
  if (nonFood) {
    return buildNoScoreBreakdown(nonFood, { allergenWarnings: ctx.allergenWarnings });
  }

  // ── §1.2 — Sin datos suficientes ──
  const insufficient = detectInsufficientData({
    items: ctx.items,
    evaluated: ctx.ingredients,
    certificationsRemoved: ctx.certificationsRemoved,
  });
  if (insufficient) {
    return buildNoScoreBreakdown(insufficient, {
      ingredients: ctx.ingredients,
      allergenWarnings: ctx.allergenWarnings,
    });
  }

  const annulments = detectAnnulments(annulmentSubject(ctx));
  const notices = [...noticesFor(ctx), ...annulments.notices];

  // ── §5 — Las anulaciones cortan antes de todo lo demás ──
  if (annulments.reasons.length > 0) {
    return scoreAsAnnulled(ctx, annulments.reasons, annulments.isChildrenProduct, notices);
  }

  // ── §2 Paso 1 ──
  const { ledger: opened, anchor } = openLedger(ctx);

  // Un producto que salió de un ancla ya "saltó al Paso 5": el ancla ES el
  // puntaje. Lo único que lo puede recortar es el techo que venga de §5, que
  // no es un techo del Paso 4 sino el desenlace suave de una anulación.
  const scored = anchor
    ? { ledger: opened, processing: EMPTY_PROCESSING, seals: [] as const }
    : runComposite(opened, product, ctx);

  // ── §2 Paso 4 ──
  const ceilings = anchor
    ? (annulments.ceiling ? [annulments.ceiling] : [])
    : collectCeilings({
        ingredients: ctx.ingredients,
        isSportsSupplement: ctx.isSportsSupplement,
        fromAnnulments: annulments.ceiling,
      });

  const ceiling = lowestCeiling(ceilings);
  const capped = ceiling ? scored.ledger.capAt(ceiling.value, ceiling.reason) : scored.ledger;

  // ── §2 Paso 5 ──
  const closed = capped.close();

  return buildBreakdown({
    score: closed.score,
    steps: closed.steps,
    ingredients: ctx.ingredients,
    processing: scored.processing,
    annulments: [],
    ceiling,
    anchor,
    seals: scored.seals,
    allergenWarnings: ctx.allergenWarnings,
    notices,
  });
}

/**
 * Los ingredientes analizados, en el orden de la etiqueta (§7).
 *
 * Sale del MISMO cálculo que el puntaje: en v2.1 la posición de cada
 * ingrediente y su resta son parte del resultado, así que recalcularlos por
 * separado podría producir una lista que no le corresponde al número que se
 * está mostrando.
 */
export function analyzeIngredients(product: ProductInput): readonly AnalyzedIngredient[] {
  return scoreProduct(product).ingredients;
}

/** Pasos 2, 3 y el modificador nutricional, en el orden del documento. */
function runComposite(ledger: ScoreLedger, product: ProductInput, ctx: ScoringContext) {
  const afterDeductions = applyIngredientDeductions(ledger, ctx.ingredients);
  const processed = applyProcessing(afterDeductions, ctx.ingredients);
  const nourished = applyNutrition(processed.ledger, product, ctx.ingredients);

  return { ledger: nourished.ledger, processing: processed.verdict, seals: nourished.seals };
}
