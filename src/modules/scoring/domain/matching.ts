/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Consultas sobre la rúbrica

   Todo lo que responde "¿qué dice la rúbrica sobre este texto?". Son
   funciones puras sobre las tablas de `rubric/`: no conocen el pipeline, no
   arman salida y no deciden puntajes.

   El índice se construye una sola vez al cargar el módulo, con los alias
   ordenados de más largo a más corto. Ese orden es la regla de desempate del
   documento: en cada tramo del texto gana el término más específico, así
   "azúcar de coco" no queda tapada por "azúcar" ni "aceite de oliva extra
   virgen" por "aceite de oliva".
═══════════════════════════════════════════════════════════ */

import { indexOfPhrase, matchesAnyTerm, normalizeText } from './text';
import type {
  AbbreviationMatch,
  Anchor,
  AnchorMatch,
  ImpactEntry,
  ImpactMatch,
  Impact,
  RubricMatch,
} from './types';
import {
  ALL_ANCHORS,
  DRINK_CATEGORY_PATTERN,
  FRUIT_JUICE_PATTERN,
  IMPACT_TABLE,
  LABEL_ABBREVIATIONS,
  NEGATIVE_ANCHORS,
  NON_MARKER_OVERRIDES,
  POSITIVE_ANCHORS,
} from './rubric';

/* ────────────────────────────────────────────────────────────
   Índice de alias
   ──────────────────────────────────────────────────────────── */

interface AliasIndexEntry {
  readonly alias: string;
  readonly impact: Impact;
  readonly marker: boolean;
  readonly entry: ImpactEntry;
}

/**
 * El eritritol aparece en dos lugares del documento a propósito: §4.6 lo
 * lista entre los polioles (impacto medio) y §2 Paso 3 lo excluye
 * explícitamente de los marcadores de ultraprocesado, junto con la stevia y
 * el monk fruit. La excepción se resuelve al construir el índice, no en el
 * motor.
 */
function isMarker(entry: ImpactEntry, alias: string): boolean {
  if (!entry.marker) return false;
  return !NON_MARKER_OVERRIDES.includes(alias);
}

const ALIAS_INDEX: readonly AliasIndexEntry[] = IMPACT_TABLE
  .flatMap((entry) =>
    entry.aliases.map((alias) => {
      const normalized = normalizeText(alias);
      return { alias: normalized, impact: entry.impact, marker: isMarker(entry, normalized), entry };
    }),
  )
  .sort((a, b) => b.alias.length - a.alias.length);

/* ────────────────────────────────────────────────────────────
   Búsqueda de sustancias dentro de un fragmento
   ──────────────────────────────────────────────────────────── */

/** ¿Los tramos `[aStart, aEnd)` y `[bStart, bEnd)` se pisan? */
function overlaps(a: readonly [number, number], bStart: number, bEnd: number): boolean {
  return bStart < a[1] && a[0] < bEnd;
}

/**
 * TODAS las sustancias de la rúbrica presentes en el fragmento, sin
 * superponerse y en el orden en que aparecen.
 *
 * Existe porque un fragmento no siempre es un ingrediente: cuando el rotulado
 * viene mal parseado, "AGUA CARBONATADA AZUCARES" llega como uno solo.
 */
export function rubricMatches(text: string): RubricMatch[] {
  const haystack = normalizeText(text);
  const found: RubricMatch[] = [];
  const taken: [number, number][] = [];

  for (const candidate of ALIAS_INDEX) {
    const start = indexOfPhrase(haystack, candidate.alias);
    if (start < 0) continue;

    const end = start + candidate.alias.length;
    if (taken.some((tramo) => overlaps(tramo, start, end))) continue; // ya lo cubre uno más largo

    taken.push([start, end]);
    found.push({
      term: candidate.alias,
      impact: candidate.impact,
      marker: candidate.marker,
      entry: candidate.entry,
      start,
      end,
    });
  }

  return found.sort((a, b) => a.start - b.start);
}

/** De peor a mejor. El primero de esta lista es el que manda. */
const IMPACT_SEVERITY: readonly Impact[] = ['alto', 'medio', 'bajo', 'none', 'desconocido'];

/** El peor de dos impactos. */
export function worstImpact(a: Impact, b: Impact): Impact {
  return IMPACT_SEVERITY.indexOf(a) <= IMPACT_SEVERITY.indexOf(b) ? a : b;
}

/**
 * El veredicto de la rúbrica sobre un fragmento, o `null` si no tiene
 * opinión.
 *
 * Manda el PEOR impacto: un fragmento como "AGUA CARBONATADA AZUCARES" (el
 * OCR se comió la coma) contiene agua y azúcar, y lo que define al producto es
 * el azúcar. El marcador, en cambio, es del fragmento entero: si adentro hay
 * dos sustancias y una es marcador, el fragmento lo es.
 */
export function rubricImpact(text: string): ImpactMatch | null {
  const all = rubricMatches(text);
  if (all.length === 0) return null;

  const worst = all.reduce((acc, m) =>
    IMPACT_SEVERITY.indexOf(m.impact) < IMPACT_SEVERITY.indexOf(acc.impact) ? m : acc,
  );

  return {
    impact: worst.impact,
    marker: all.some((m) => m.marker),
    entry: worst.entry,
    term: worst.term,
  };
}

/* ────────────────────────────────────────────────────────────
   §8 — Abreviaturas del rotulado argentino
   ──────────────────────────────────────────────────────────── */

/**
 * Resuelve "COL 150 d" / "ACI 338" / "ARO" a su clase y su impacto.
 *
 * El rotulado nacional declara la CLASE del aditivo abreviada más su número
 * INS, no el nombre completo. Sin esta tabla, todos esos aditivos caían como
 * "alimento no reconocido" — y una gaseosa con los tres en notación abreviada
 * salía "Buena opción".
 *
 * §6.3: cuando hay número, el número manda. "COL 102" es tartrazina (impacto
 * alto), no un colorante genérico.
 */
export function resolveLabelAbbreviation(text: string): AbbreviationMatch | null {
  const trimmed = text.trim();

  for (const { prefix, label } of LABEL_ABBREVIATIONS) {
    if (!prefix.test(trimmed)) continue;

    const digits = trimmed.match(/\d{3,4}/)?.[0];
    if (!digits) return { label, impact: 'medio', marker: false };

    const byNumber = rubricImpact(`e${digits}`);
    return {
      label: `${label} E${digits}`,
      // Sin clasificación específica vale el default para aditivos: medio.
      impact: byNumber?.impact ?? 'medio',
      marker: byNumber?.marker ?? false,
    };
  }

  return null;
}

/* ────────────────────────────────────────────────────────────
   §3 — Anclas
   ──────────────────────────────────────────────────────────── */

/**
 * §3 — Valor determinista de un ancla.
 *
 * §7 exige que el mismo producto dé siempre el mismo puntaje, así que el
 * rango del documento se resuelve a su punto medio y no a un valor elegido en
 * runtime.
 */
export function anchorScore(anchor: Anchor): number {
  return Math.round((anchor.min + anchor.max) / 2);
}

/** ¿La lista entera cabe en el universo de términos de esta fila? */
function coversEveryIngredient(names: readonly string[], anchor: Anchor): boolean {
  const universe = [...anchor.required, ...anchor.allowed];
  return names.every((name) => matchesAnyTerm(name, universe));
}

/** ¿Está el ingrediente que el ancla exige, por nombre o por composición? */
function hasRequiredIngredients(names: readonly string[], anchor: Anchor, categories: string): boolean {
  if (names.some((name) => matchesAnyTerm(name, anchor.required))) return true;

  const byComposition = (anchor.requiredAll ?? []).some((set) =>
    set.every((term) => names.some((name) => matchesAnyTerm(name, [term]))),
  );
  if (byComposition) return true;

  return anchor.categoryPattern?.test(categories) ?? false;
}

/**
 * Regla de cierre de §4.2 aplicada a las anclas: el jugo aporta los azúcares
 * de la fruta sin su fibra ni su matriz, así que no puede llevarse el ancla de
 * la fruta entera.
 *
 * Sin esto, "Jugo de naranja 100% exprimido" puntuaba 95 — decirle a alguien
 * que el jugo equivale a comerse la naranja es exactamente la confusión que
 * esa regla existe para evitar. El agua y las infusiones quedan fuera de la
 * exclusión: un té no es un jugo aunque esté en la góndola de bebidas.
 */
function looksLikeJuice(names: readonly string[], categories: string): boolean {
  return names.some((n) => FRUIT_JUICE_PATTERN.test(n)) || DRINK_CATEGORY_PATTERN.test(categories);
}

const JUICE_EXEMPT_ANCHORS = new Set(['agua', 'infusiones']);

function isDisqualifiedAsJuice(anchor: Anchor): boolean {
  return POSITIVE_ANCHORS.includes(anchor) && !JUICE_EXEMPT_ANCHORS.has(anchor.id);
}

/**
 * §3 — El ancla que cubre a TODOS los ingredientes de la lista, o `null`.
 *
 * `sugars` es el control cruzado con el panel: los datos de catálogo son
 * colaborativos, y una gaseosa cargada con un único ingrediente "Agua"
 * recibiría el puntaje del agua mineral. Si el panel desmiente al listado, el
 * ancla no aplica.
 */
export function matchAnchor(
  names: readonly string[],
  categories = '',
  sugars?: number,
): AnchorMatch | null {
  if (names.length === 0) return null;

  const juice = looksLikeJuice(names, categories);

  for (const anchor of ALL_ANCHORS) {
    if (names.length > anchor.maxIngredients) continue;
    if (juice && isDisqualifiedAsJuice(anchor)) continue;
    if (!coversEveryIngredient(names, anchor)) continue;
    if (!hasRequiredIngredients(names, anchor, categories)) continue;
    if (anchor.maxSugars != null && sugars != null && sugars > anchor.maxSugars) continue;

    return { anchor, score: anchorScore(anchor) };
  }

  return null;
}

/** §3 Regla de dominancia — el ancla negativa del ingrediente, si tiene una. */
export function negativeAnchorFor(name: string): Anchor | null {
  return NEGATIVE_ANCHORS.find((anchor) => matchesAnyTerm(name, anchor.required)) ?? null;
}
