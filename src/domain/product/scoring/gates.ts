/* ═══════════════════════════════════════════════════════════
   FITOGENIX — §1 y §5: las compuertas

   Las dos clases de decisión que se toman ANTES de la cuenta y que la anulan:

   · §1 — cuándo no se puntúa. Fuera de alcance, o la lista no describe nada.
   · §5 — cuándo el puntaje lo fija una anulación en vez de la aritmética.

   Todo acá es puro: entra texto ya limpio y clasificado, sale un veredicto.
   Ninguna función toca el puntaje; solo dicen qué pasa.
═══════════════════════════════════════════════════════════ */

import { matchesPhrase } from './text';
import { NO_DATA } from './constants';
import {
  ANNUL_GATES,
  ASCORBATE_PATTERN,
  ASCORBATE_TAGS,
  AZO_COLORANTS,
  AZO_REASON,
  CATEGORY_TERMS,
  CHILDREN_PRODUCT_PATTERN,
  CURED_MEAT_REASON,
  CURED_MEAT_WITH_ASCORBATE_REASON,
  CURING_AGENT_PATTERN,
  CURING_AGENT_TAGS,
  NITRITE_NON_MEAT_REASON,
  NON_FOOD_SUBSTANCES,
  NO_DATA_MESSAGE,
  OUT_OF_SCOPE,
  OUT_OF_SCOPE_NON_FOOD_MESSAGE,
  PROCESSED_MEAT_PATTERN,
  VEGETABLE_AS_FOOD_PATTERN,
  VEGETABLE_CURING_NOTICE,
  VEGETABLE_CURING_PATTERN,
} from './rubric';
import { CEILINGS } from './constants';
import type { Ceiling, CleanIngredient, EvaluatedIngredient, NoScore } from './types';

/* ────────────────────────────────────────────────────────────
   §1.1 — Fuera de alcance
   ──────────────────────────────────────────────────────────── */

/** El grado alcohólico del rotulado delata una bebida que la categoría a veces
 *  no declara. */
const ALCOHOL_BY_VOLUME = /\b\d{1,2}[.,]?\d?\s*% ?vol\b/i;
const ALCOHOL_RULE_ID = 'alcohol';

export interface ScopeSubject {
  readonly productName: string;
  readonly categories: string;
  readonly ingredientsText: string;
}

/**
 * §1.1 — Categorías que Fitogenix no evalúa.
 *
 * Se busca en nombre + categoría porque el dato de categoría de las fuentes es
 * irregular y a veces lo único que delata al producto es cómo se llama.
 */
export function detectOutOfScope(subject: ScopeSubject): NoScore | null {
  const haystack = `${subject.productName} ${subject.categories}`;

  for (const rule of OUT_OF_SCOPE) {
    if (rule.pattern.test(haystack)) return { code: 'fuera-de-alcance', message: rule.message };
  }

  if (ALCOHOL_BY_VOLUME.test(subject.ingredientsText)) {
    const alcohol = OUT_OF_SCOPE.find((r) => r.id === ALCOHOL_RULE_ID);
    if (alcohol) return { code: 'fuera-de-alcance', message: alcohol.message };
  }

  return null;
}

/**
 * §1.1 red de contención — "si la lista contiene sustancias no alimentarias,
 * no puntuar aunque la categoría en la base diga que es un alimento".
 *
 * La categoría es un dato de terceros; la lista de ingredientes es el producto.
 */
export function detectNonFood(listText: string): NoScore | null {
  return NON_FOOD_SUBSTANCES.test(listText)
    ? { code: 'no-alimentario', message: OUT_OF_SCOPE_NON_FOOD_MESSAGE }
    : null;
}

/* ────────────────────────────────────────────────────────────
   §1.2 — Sin datos suficientes
   ──────────────────────────────────────────────────────────── */

function fractionOfLetters(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length / Math.max(1, text.length);
}

/** ¿La lista es un puñado de términos de CATEGORÍA en vez de ingredientes? */
function isOnlyCategories(items: readonly CleanIngredient[]): boolean {
  return items.every((item) => CATEGORY_TERMS.some((term) => matchesPhrase(item.key, term)));
}

/** ¿La mitad o más de los fragmentos son numéricos o sin sentido semántico? */
function isMostlyGibberish(items: readonly CleanIngredient[]): boolean {
  const gibberish = items.filter((i) => fractionOfLetters(i.raw) < NO_DATA.minAlphaRatio).length;
  return gibberish > items.length / 2;
}

/**
 * "3 o más ingredientes no identificados, o más del 30% de la lista."
 *
 * El criterio porcentual se aplica desde 2 no identificados para arriba.
 * Tomado al pie de la letra alcanzaría a cualquier lista de 3 ingredientes con
 * uno solo sin reconocer (1/3 = 33%), y eso volvería inalcanzables los techos
 * de 74 y 49 que §2 Paso 4 define justamente para 1 y 2 no identificados. Un
 * producto con un único término opaco tiene techo, no ausencia de dato.
 */
function tooManyUnidentified(evaluated: readonly EvaluatedIngredient[]): boolean {
  const unknown = evaluated.filter((e) => !e.known).length;
  if (unknown >= NO_DATA.unknownCountLimit) return true;
  if (unknown < NO_DATA.unknownRatioAppliesFrom) return false;
  return unknown / evaluated.length > NO_DATA.unknownRatioLimit;
}

export interface DataSufficiencySubject {
  readonly items: readonly CleanIngredient[];
  readonly evaluated: readonly EvaluatedIngredient[];
  readonly certificationsRemoved: readonly string[];
}

/** §1.2 — ¿La lista, ya limpia, describe algo? */
export function detectInsufficientData(subject: DataSufficiencySubject): NoScore | null {
  const { items, evaluated, certificationsRemoved } = subject;

  if (items.length === 0) {
    return {
      code: certificationsRemoved.length > 0 ? 'solo-certificaciones' : 'sin-ingredientes',
      message: NO_DATA_MESSAGE,
    };
  }
  if (isOnlyCategories(items)) return { code: 'solo-categorias', message: NO_DATA_MESSAGE };
  if (isMostlyGibberish(items)) return { code: 'sin-ingredientes', message: NO_DATA_MESSAGE };
  if (tooManyUnidentified(evaluated)) return { code: 'sin-identificar', message: NO_DATA_MESSAGE };

  return null;
}

/* ────────────────────────────────────────────────────────────
   §5.2 — Curado de cárnicos
   ──────────────────────────────────────────────────────────── */

/** Los tres desenlaces que define el documento. */
export type CuringOutcome =
  | { readonly kind: 'annul'; readonly reason: string; readonly notice?: string }
  | { readonly kind: 'ceiling'; readonly ceiling: Ceiling; readonly notice?: string }
  | null;

export interface AnnulmentSubject {
  readonly listText: string;
  readonly categories: string;
  readonly productName: string;
  readonly additiveTags: ReadonlySet<string>;
}

function hasAny(subject: AnnulmentSubject, pattern: RegExp, tags: readonly string[] = []): boolean {
  return pattern.test(subject.listText) || tags.some((tag) => subject.additiveTags.has(tag));
}

/**
 * §5.2 — Curado de cárnicos.
 *
 * *Los agentes vegetales aportan nitrato que se convierte en nitrito durante
 * el curado. Su función en un fiambre es idéntica a la del nitrito de sodio:
 * conservar y dar color rosado. La diferencia es de etiqueta, no de química.*
 */
export function evaluateCuring(subject: AnnulmentSubject): CuringOutcome {
  const { listText, categories } = subject;

  const declared = hasAny(subject, CURING_AGENT_PATTERN, CURING_AGENT_TAGS);
  const vegetable = listText.match(VEGETABLE_CURING_PATTERN);
  const isProcessedMeat = PROCESSED_MEAT_PATTERN.test(`${listText} ${categories}`);

  // §5.2 excepción — nitrato natural en un vegetal donde el vegetal ES el
  // alimento (espinaca, remolacha, rúcula).
  if (!declared && vegetable && !isProcessedMeat && VEGETABLE_AS_FOOD_PATTERN.test(listText)) {
    return null;
  }
  if (!declared && !vegetable) return null;

  const notice = vegetable ? VEGETABLE_CURING_NOTICE(vegetable[0]) : undefined;

  if (isProcessedMeat) {
    const hasAscorbate = hasAny(subject, ASCORBATE_PATTERN, ASCORBATE_TAGS);
    return hasAscorbate
      ? { kind: 'ceiling', ceiling: { value: CEILINGS.hard, reason: CURED_MEAT_WITH_ASCORBATE_REASON }, notice }
      : { kind: 'annul', reason: CURED_MEAT_REASON, notice };
  }

  // "Nitrito en producto no cárnico → no hay anulación, impacto Alto y techo
  // 59." El agente vegetal fuera de un cárnico no cura nada: es apio.
  if (!declared) return null;
  return {
    kind: 'ceiling',
    ceiling: { value: CEILINGS.nitriteNonMeat, reason: NITRITE_NON_MEAT_REASON },
  };
}

/* ────────────────────────────────────────────────────────────
   §5 — Anulaciones
   ──────────────────────────────────────────────────────────── */

export interface AnnulmentVerdict {
  readonly reasons: readonly string[];
  readonly notices: readonly string[];
  /** El techo que deja el curado con ascorbato, si fue ese el desenlace. */
  readonly ceiling: Ceiling | null;
  readonly isChildrenProduct: boolean;
}

/** ¿El producto está dirigido a niños? Cuesta 4 puntos más en la anulación y
 *  hace que un solo colorante azoico alcance para anular (§5.6). */
export function isChildrenProduct(categories: string, productName: string): boolean {
  return CHILDREN_PRODUCT_PATTERN.test(`${categories} ${productName}`);
}

export function detectAnnulments(subject: AnnulmentSubject): AnnulmentVerdict {
  const reasons: string[] = [];
  const notices: string[] = [];
  let ceiling: Ceiling | null = null;

  for (const gate of ANNUL_GATES) {
    if (hasAny(subject, gate.pattern, gate.additiveTags)) reasons.push(gate.reason);
  }

  const curing = evaluateCuring(subject);
  if (curing?.notice) notices.push(curing.notice);
  if (curing?.kind === 'annul') reasons.push(curing.reason);
  if (curing?.kind === 'ceiling') ceiling = curing.ceiling;

  // §5.6 — Anulan con 2 o más, o con cualquiera en producto dirigido a niños.
  // Uno solo en producto no infantil ya pesa como impacto alto en la tabla.
  const children = isChildrenProduct(subject.categories, subject.productName);
  const azo = AZO_COLORANTS.filter((c) => hasAny(subject, c.pattern, [c.tag]));
  if (azo.length >= 2 || (azo.length >= 1 && children)) {
    reasons.push(AZO_REASON(azo.map((c) => c.name), children));
  }

  return { reasons, notices, ceiling, isChildrenProduct: children };
}
