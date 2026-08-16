/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Clasificación de un ingrediente

   Un ingrediente limpio entra, un `EvaluatedIngredient` sale. Función pura,
   sin estado, sin conocer el resto de la lista ni el puntaje.

   El orden de precedencia de §4 está modelado como una CADENA DE RESOLUTORES
   y no como una escalera de `if`. Tres motivos:

   · el orden queda a la vista, como dato, en un solo lugar (`RESOLVERS`);
   · cada regla se puede testear sola, sin montar todo el pipeline;
   · agregar una regla es agregar una función a un array, no meter una rama en
     el medio de una escalera de veinte líneas.

   La última de la cadena nunca devuelve `null`: si nadie reconoció el
   ingrediente, es NO IDENTIFICADO. "No inventes. No infieras. No estimes por
   analogía."
═══════════════════════════════════════════════════════════ */

import { normalizeText, toSentenceCase } from './text';
import { rubricImpact, rubricMatches, resolveLabelAbbreviation, worstImpact } from './matching';
import {
  ADDITIVE_PATTERN,
  COLLECTIVE_NOUNS,
  FRUIT_JUICE_PATTERN,
  FUNCTIONAL_CLAIMS,
  PROPRIETARY_CLAIMS,
  UNIDENTIFIED_DESC,
  VALUATIVE_ADJECTIVES,
} from './rubric';
import { CATEGORY_TERMS } from './rubric/scope';
import { canonicalNameFor, descriptionFor, findInCatalog, impactFromCatalog } from './catalog';
import type { CleanIngredient, EvaluatedIngredient, Impact, IngredientResolver } from './types';

/* ────────────────────────────────────────────────────────────
   Construcción de un resultado
   ──────────────────────────────────────────────────────────── */

/** Lo que varía entre resolutores; el resto tiene defaults sensatos. */
interface Classification {
  readonly display: string;
  readonly impact: Impact;
  readonly desc: string;
  readonly marker?: boolean;
  readonly known?: boolean;
  readonly detail?: string;
  readonly isolatedProtein?: boolean;
  readonly mandatory?: boolean;
}

function evaluated(item: CleanIngredient, c: Classification): EvaluatedIngredient {
  return {
    item,
    display: c.display,
    impact: c.impact,
    marker: c.marker ?? false,
    known: c.known ?? true,
    desc: c.desc,
    isolatedProtein: c.isolatedProtein ?? false,
    mandatory: c.mandatory ?? false,
    ...(c.detail ? { detail: c.detail } : {}),
  };
}

/** §4.7 — El último recurso, y el único resolutor que nunca falla. */
function unidentified(item: CleanIngredient): EvaluatedIngredient {
  return evaluated(item, {
    display: toSentenceCase(item.raw),
    impact: 'desconocido',
    known: false,
    desc: UNIDENTIFIED_DESC,
  });
}

/* ────────────────────────────────────────────────────────────
   Nombre a mostrar
   ──────────────────────────────────────────────────────────── */

/** Largo máximo del texto de etiqueta que conviene mostrar tal cual. */
const MAX_VERBATIM_DISPLAY = 40;

/**
 * El texto de la etiqueta gana cuando es más específico y entra en una línea:
 * "cuero de cerdo" es más honesto que "Cerdo", y "cebolla de verdeo" no se
 * confunde con la cebolla común.
 */
function preferLabelText(labelText: string, canonical: string): string {
  const trimmed = labelText.trim();
  const isRicher =
    normalizeText(trimmed).includes(normalizeText(canonical)) &&
    trimmed.length > canonical.length &&
    trimmed.length <= MAX_VERBATIM_DISPLAY;
  return isRicher ? toSentenceCase(trimmed) : canonical;
}

/**
 * Nombre a mostrar. Un producto con "PALM OIL" se muestra como "Aceite de
 * palma", y el idioma de origen nunca sale del motor (§6.2).
 *
 * `winningTerm` es el término que DECIDIÓ el impacto. Que el nombre salga de
 * ahí y no del fragmento entero es lo que impide el defecto más caro que tuvo
 * el motor: cuando el OCR se comía las comas, "AGUA CARBONATADA AZUCARES"
 * quedaba como un fragmento, puntuaba por el azúcar y se mostraba como "Agua"
 * pintada de rojo. El puntaje estaba bien; lo que leía el usuario era falso.
 */
function displayNameFor(labelText: string, winningTerm?: string): string {
  const matches = rubricMatches(labelText);

  // Un solo término reconocido: el fragmento entero describe ese ingrediente,
  // así que puede ganar el texto de la etiqueta si es más específico.
  if (matches.length <= 1) {
    const canonical = canonicalNameFor(labelText);
    if (canonical) return preferLabelText(labelText, canonical);
    return toSentenceCase(matches[0]?.term ?? labelText);
  }

  // Varios: gana el que decidió el impacto, con su nombre canónico.
  const term = winningTerm ?? matches[0].term;
  return canonicalNameFor(term) ?? toSentenceCase(term);
}

/** §7 — Si no hay justificación pre-escrita, no se inventa una. */
function fallbackDescription(name: string, impact: Impact): string {
  if (impact === 'none') return `${toSentenceCase(name)}: sin objeciones desde la mirada Fitogenix.`;
  return 'No tenemos una evaluación específica de este ingrediente todavía.';
}

/* ────────────────────────────────────────────────────────────
   §4.7 — Denominaciones de marketing
   ──────────────────────────────────────────────────────────── */

const JUICE_DESC =
  'Jugo de fruta: aporta los azúcares de la fruta sin su fibra ni su matriz. Se evalúa como azúcar libre.';

/** ¿El fragmento nombra un ingrediente individual verificable? Un término de
 *  CATEGORÍA (granos, cereales, vegetales) no cuenta: es justamente la clase
 *  de palabra con la que se construyen las frases de marketing. */
function namesSomethingVerifiable(text: string): boolean {
  const isCategory = (term: string) => CATEGORY_TERMS.includes(term);
  if (rubricMatches(text).some((m) => !isCategory(m.term))) return true;
  return findInCatalog(text) != null && !CATEGORY_TERMS.some((c) => normalizeText(text).includes(c));
}

/** Saca el envoltorio y deja lo que la frase realmente nombra, si nombra algo. */
function stripMarketingWrapper(text: string): string {
  return normalizeText(
    text
      .replace(new RegExp(VALUATIVE_ADJECTIVES.source, 'gi'), ' ')
      .replace(new RegExp(COLLECTIVE_NOUNS.source, 'gi'), ' ')
      .replace(new RegExp(FUNCTIONAL_CLAIMS.source, 'gi'), ' ')
      .replace(/®|™/g, ' '),
  );
}

/**
 * §4.7 — "cualquier frase que contenga adjetivos valorativos, sustantivos
 * colectivos sin desagregar, reclamos de propiedad o reclamos funcionales Y NO
 * NOMBRE UN INGREDIENTE INDIVIDUAL VERIFICABLE".
 *
 * La segunda mitad de la condición es la que hace la regla usable: "aroma
 * natural" tiene un adjetivo valorativo y sigue siendo un aroma; "mezcla
 * natural de granos ancestrales seleccionados" no nombra nada.
 */
function isMarketingDenomination(text: string): boolean {
  const signals = {
    collective: COLLECTIVE_NOUNS.test(text),
    proprietary: PROPRIETARY_CLAIMS.test(text),
    functional: FUNCTIONAL_CLAIMS.test(text),
    valuative: new RegExp(VALUATIVE_ADJECTIVES.source, 'i').test(text),
  };
  if (!Object.values(signals).some(Boolean)) return false;

  return !namesSomethingVerifiable(stripMarketingWrapper(text));
}

/* ────────────────────────────────────────────────────────────
   Los resolutores, en orden de precedencia
   ──────────────────────────────────────────────────────────── */

/** §6.3 — Número E declarado en el fragmento: "si el número E y el nombre
 *  discrepan, manda el número E". */
function eNumberIn(text: string): string | null {
  const match = normalizeText(text).match(/\b(?:e|ins)\s?(\d{3,4})([a-d])?\b/);
  return match ? `e${match[1]}${match[2] ?? ''}` : null;
}

const byENumber: IngredientResolver = (item) => {
  const code = eNumberIn(item.raw);
  if (!code) return null;
  const match = rubricImpact(code);
  if (!match) return null;

  return evaluated(item, {
    display: displayNameFor(item.raw, match.term),
    impact: match.impact,
    marker: match.marker,
    desc: match.entry.desc ?? descriptionFor(item.raw) ?? fallbackDescription(item.raw, match.impact),
    detail: 'Aditivo alimentario',
  });
};

/** Va antes de la tabla porque el problema es la frase entera, no las palabras
 *  sueltas que contiene. */
const byMarketingDenomination: IngredientResolver = (item) =>
  isMarketingDenomination(item.raw) ? unidentified(item) : null;

const byRubricTable: IngredientResolver = (item) => {
  const match = rubricImpact(item.raw);
  if (!match) return null;

  // Regla de cierre de §4.2 sobre la fila de la fruta entera: "jugo de naranja
  // exprimido" matchea "naranja" y quedaría sin penalización. El "jugo de
  // limón" de §4.5 no cae acá porque tiene fila propia.
  if (match.entry.id === 'frutas-verduras' && FRUIT_JUICE_PATTERN.test(item.raw)) {
    return evaluated(item, { display: toSentenceCase(item.raw), impact: 'medio', desc: JUICE_DESC });
  }

  return evaluated(item, {
    display: displayNameFor(item.raw, match.term),
    impact: match.entry.mandatoryFortification ? 'none' : match.impact,
    marker: match.marker,
    desc: match.entry.desc ?? descriptionFor(item.raw) ?? fallbackDescription(item.raw, match.impact),
    isolatedProtein: match.entry.isolatedProtein,
    mandatory: match.entry.mandatoryFortification,
  });
};

const byLabelAbbreviation: IngredientResolver = (item) => {
  const match = resolveLabelAbbreviation(item.raw);
  if (!match) return null;

  return evaluated(item, {
    display: match.label,
    impact: match.impact,
    marker: match.marker,
    desc: `Declarado en la etiqueta como "${item.raw}", la notación abreviada del rotulado argentino. Aditivo industrial.`,
    detail: 'Aditivo alimentario',
  });
};

/** Que la etiqueta lo declare como aditivo ya prueba qué es; no saber cuál no
 *  equivale a que no haya riesgo. */
const byAdditivePattern: IngredientResolver = (item) => {
  if (!ADDITIVE_PATTERN.test(item.raw)) return null;

  return evaluated(item, {
    display: toSentenceCase(item.raw),
    impact: 'medio',
    desc: 'Aditivo industrial sin clasificación específica en nuestra base. Se evalúa con impacto medio: la falta de clasificación no equivale a ausencia de riesgo.',
    detail: 'Aditivo alimentario',
  });
};

/** §4.2 regla de cierre — el jugo aporta azúcares libres sin la fibra ni la
 *  matriz de la fruta, aunque sea 100% exprimido. */
const byJuiceClosure: IngredientResolver = (item) =>
  FRUIT_JUICE_PATTERN.test(item.raw)
    ? evaluated(item, { display: toSentenceCase(item.raw), impact: 'medio', desc: JUICE_DESC })
    : null;

/** La tabla de §4, crecida: ver `catalog.ts`. */
const byCatalog: IngredientResolver = (item) => {
  const record = findInCatalog(item.raw);
  if (!record) return null;

  const impact = impactFromCatalog(record);
  if (impact === 'desconocido') return null;

  return evaluated(item, {
    display: preferLabelText(item.raw, canonicalNameFor(item.raw) ?? item.raw),
    impact,
    desc: record.desc,
  });
};

/**
 * El orden de §4, explícito. Se lee de arriba a abajo y el primero que
 * responde gana.
 */
const RESOLVERS: readonly IngredientResolver[] = [
  byENumber,              // §6.3 — el número E manda sobre el nombre
  byMarketingDenomination, // §4.7 — la frase entera es el problema
  byRubricTable,          // §4   — la tabla es la autoridad
  byLabelAbbreviation,    // §8   — "COL 150 d", "ACI 338"
  byAdditivePattern,      // aditivo declarado sin clasificar → medio
  byJuiceClosure,         // §4.2 — regla de cierre
  byCatalog,              // la tabla crecida
];

/* ────────────────────────────────────────────────────────────
   Entrada principal
   ──────────────────────────────────────────────────────────── */

/**
 * §6.4 — "y/o": un ingrediente, con la clasificación del PEOR de los
 * declarados. Se resuelve clasificando cada alternativa por separado y
 * quedándose con la peor, para que la regla valga sea cual sea el resolutor
 * que atienda a cada rama.
 */
function classifyAlternatives(item: CleanIngredient, alternatives: readonly string[]): EvaluatedIngredient {
  const parts = alternatives.map((alt) =>
    classifyIngredient({ ...item, raw: alt, key: normalizeText(alt), alternatives: undefined }),
  );
  const worst = parts.reduce((acc, p) => (worstImpact(acc.impact, p.impact) === p.impact ? p : acc));

  return {
    ...worst,
    item,
    display: alternatives.map(toSentenceCase).join(' o '),
    marker: parts.some((p) => p.marker),
    known: parts.every((p) => p.known),
    isolatedProtein: parts.some((p) => p.isolatedProtein),
  };
}

/** Un ingrediente limpio → su clasificación. Determinista y sin efectos. */
export function classifyIngredient(item: CleanIngredient): EvaluatedIngredient {
  if (item.alternatives && item.alternatives.length > 1) {
    return classifyAlternatives(item, item.alternatives);
  }

  for (const resolve of RESOLVERS) {
    const result = resolve(item);
    if (result) return result;
  }
  return unidentified(item);
}

/**
 * ¿El motor sabe qué es esta cadena? Lo usa §6.5 para decidir si un paréntesis
 * es una sub-lista o una aclaración de etiqueta.
 */
export function resolvesToSomething(text: string): boolean {
  if (rubricMatches(text).length > 0) return true;
  if (ADDITIVE_PATTERN.test(text)) return true;
  return findInCatalog(text) != null;
}

/** La severidad que se muestra sale del impacto que efectivamente puntuó, para
 *  que el color y el número no puedan discrepar. */
export function severityOf(impact: Impact) {
  switch (impact) {
    case 'alto': return 'red' as const;
    case 'medio': return 'orange' as const;
    case 'bajo': return 'yellow' as const;
    case 'desconocido': return 'gray' as const;
    default: return 'green' as const;
  }
}
