// La orquestación, en el orden del documento: §1 alcance → §6 limpieza → §4 clasificación →
// §1.2 datos → §5 anulaciones → §2 (base o ancla, restas, procesamiento, nutrición, techos,
// acotar). Toda la aritmética pasa por `ScoreLedger`.

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

/** Aditivos que declara la base (`en:e150d`) y no están en el texto: cuentan, pero siempre
 *  desde la posición 4 (las tres primeras son del rotulado, por peso). */
function additivesFromTags(
  tags: readonly string[],
  fromLabel: readonly EvaluatedIngredient[],
): EvaluatedIngredient[] {
  // Códigos que la etiqueta ya nombra ("INS 322", "E-322i", "ins n° 322"), con su variante si la dice.
  const labelCodes = fromLabel.flatMap((t) =>
    [...`${t.item.raw} ${t.display}`.toLowerCase().matchAll(/\b(?:ins|e)[\s-]*(?:n[°º]?\s*)?(\d{3,4})\s?([a-d]?)/g)]
      .map((m) => ({ number: m[1], variant: m[2] })),
  );
  // "E322i" y "INS 322" son el mismo aditivo; "E150d" y "INS 150a" no.
  const codeOnLabel = (code: string) => {
    const tag = /^e(\d{3,4})([a-d]?)/.exec(code);
    if (!tag) return false;
    return labelCodes.some((c) => c.number === tag[1] && (!c.variant || !tag[2] || c.variant === tag[2]));
  };

  const alreadyOnLabel = (code: string, name: string | undefined) =>
    codeOnLabel(code) ||
    fromLabel.some((t) => {
      const haystack = `${normalizeText(t.item.raw)} ${normalizeText(t.display)}`;
      return haystack.includes(code) || (name != null && haystack.includes(normalizeText(name)));
    });

  const out: EvaluatedIngredient[] = [];

  for (const tag of tags) {
    const code = tag.replace(/^en:/, '');
    const known = findAdditive(tag);
    // "e322i" no tiene entrada propia: el nombre de "e322" ya dice si la etiqueta lo nombra.
    const nameForCheck = known?.name ?? findAdditive(`en:${code.replace(/(?<=\d)i{1,3}$/, '')}`)?.name;
    if (alreadyOnLabel(code, nameForCheck)) continue;

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

/** `20 − 6 × anulaciones`, piso 0, −4 si va dirigido a niños: reemplaza la cuenta entera. */
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

/** §2 Paso 1: el ancla o la base. El ancla mira la lista completa (etiqueta + aditivos de
 *  la base): un ingrediente extra la invalida. */
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

/** Un producto → su puntaje y el desglose. Determinista y sin efectos. */
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

/** Los ingredientes analizados en orden (§7), del MISMO cálculo que el puntaje. */
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
