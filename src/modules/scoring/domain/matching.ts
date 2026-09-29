// Consultas puras sobre las tablas de `rubric/`. El índice ordena los alias de más largo a más
// corto: gana el término más específico ("azúcar de coco" antes que "azúcar").

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

/** El eritritol es poliol (§4.6, impacto medio) pero no marcador de ultraprocesado (§2
 *  Paso 3), como la stevia y el monk fruit: se resuelve al armar el índice. */
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

/** Todas las sustancias del fragmento, sin superponerse y en orden (un fragmento mal
 *  parseado puede traer varias: "AGUA CARBONATADA AZUCARES"). */
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

/** El veredicto de la rúbrica sobre un fragmento, o `null`. Manda el peor impacto; si alguna
 *  sustancia es marcador, lo es el fragmento entero. */
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

/** "COL 150 d" / "ACI 338" / "ARO" → clase e impacto: el rotulado declara la clase
 *  abreviada más el INS. Con número, manda el número (§6.3): "COL 102" es tartrazina. */
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

/** §3: el rango del ancla se resuelve a su punto medio (mismo producto, mismo puntaje). */
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

/** §4.2 aplicada a las anclas: un jugo no se lleva el ancla de la fruta entera (pierde la
 *  fibra y la matriz). El agua y las infusiones no son jugo. */
function looksLikeJuice(names: readonly string[], categories: string): boolean {
  return names.some((n) => FRUIT_JUICE_PATTERN.test(n)) || DRINK_CATEGORY_PATTERN.test(categories);
}

const JUICE_EXEMPT_ANCHORS = new Set(['agua', 'infusiones']);

function isDisqualifiedAsJuice(anchor: Anchor): boolean {
  return POSITIVE_ANCHORS.includes(anchor) && !JUICE_EXEMPT_ANCHORS.has(anchor.id);
}

/** §3: el ancla que cubre a TODOS los ingredientes, o `null`. Si el panel (`sugars`)
 *  desmiente la lista, no aplica: una gaseosa cargada como "Agua" no puntúa como agua. */
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
