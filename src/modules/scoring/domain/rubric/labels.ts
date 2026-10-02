// §6 y §4.7: patrones sobre el texto del rotulado (alérgenos, certificaciones, separadores,
// denominaciones de marketing), no juicios sobre sustancias.

/** §6.1: lo que sigue a estas frases es advertencia de alérgenos: no anula, no resta, no se
 *  describe (se evalúa lo que el fabricante puso, no las trazas). */
export const ALLERGEN_PREAMBLE =
  /(?:puede(?:n)? contener|contiene trazas|trazas de|elaborado en|producido en instalaciones|procesado en|al[eé]rg[eé]nos?\s*:|contains traces|may contain)/i;

/** §4.7: certificaciones y reclamos; se sacan antes de evaluar. Si no queda ningún
 *  ingrediente, "Sin datos suficientes". */
export const CERTIFICATION_PATTERNS: readonly RegExp[] = [
  /^sin\s+t\.?a\.?c\.?c\.?$/i,
  /^sin\s+gluten$/i,
  /^apto\s+(para\s+)?cel[ií]acos?$/i,
  /^org[aá]nico[as]?$/i,
  /^kosher$/i,
  /^halal$/i,
  /^vegano[as]?$/i,
  /^vegetariano[as]?$/i,
  /^sin\s+lactosa$/i,
  /^sin\s+colesterol$/i,
  /^sin\s+az[uú]car(?:es)?(\s+(agregad[oa]s?|a[ñn]adid[oa]s?))?$/i,
  /^light$/i,
  /^diet$/i,
  /^reducido\s+en\s+sodio$/i,
  /^bajo\s+en\s+sodio$/i,
  /^alto\s+en\s+prote[ií]nas?$/i,
  /^fuente\s+de\s+/i,
  /^sin\s+conservantes?$/i,
  /^sin\s+colorantes?$/i,
  /^sin\s+ogm$/i,
  /^no\s+ogm$/i,
  /^sin\s+tacc$/i,
  /^natural$/i,
  /^d\.?o\.?p\.?$/i,
  /^i\.?g\.?p\.?$/i,
  /^sello\s+negro$/i,
  /^exceso\s+en\s+/i,
  /^gluten\s*free$/i,
  /^non\s*gmo$/i,
  /^informaci[oó]n\s+nutricional$/i,
  /^valor\s+energ[eé]tico$/i,
];

/** §6.4 — "girasol y/o soja" es UN ingrediente con la clasificación del PEOR
 *  de los declarados. */
export const AND_OR_SEPARATOR = /\s+y\s*\/\s*o\s+|\s+o\/y\s+|\s+and\s*\/\s*or\s+/i;

export const AND_OR_NOTICE = (alternatives: readonly string[]): string =>
  `La etiqueta declara ${alternatives.join(' o ')}. Como no sabemos cuál contiene esta unidad, evaluamos la opción menos favorable.`;

/* ────────────────────────────────────────────────────────────
   4. §4.7 — Denominaciones de marketing → NO IDENTIFICADO
   ──────────────────────────────────────────────────────────── */

/** Sustantivos colectivos sin desagregar. Por sí solos alcanzan: nombran un
 *  conjunto, no un ingrediente. */
export const COLLECTIVE_NOUNS =
  /\b(mezclas?|blends?|complejos?|sistemas?|matriz|matrices|f[oó]rmulas?|preparados?|base(?:s)? funcional(?:es)?)\b/i;

/** Reclamos de propiedad y funcionales. */
/* El sufijo numérico solo cuenta pegado con guion a una palabra ("BioActive-7"):
 * "harina 000" y "omega 3" son denominaciones reales y no pueden caer acá. */
export const PROPRIETARY_CLAIMS =
  /®|™|\bpatentad[oa]s?\b|\bpropietari[oa]s?\b|\bmarca registrada\b|\b\p{L}{3,}[-‑]\d{1,3}\b/u;

export const FUNCTIONAL_CLAIMS =
  /\balta biodisponibilidad\b|\babsorci[oó]n r[aá]pida\b|\bliberaci[oó]n (?:prolongada|sostenida)\b|\bde acci[oó]n\b|\bbioactiv[oa]s?\b|\bpotenciad[oa]s?\b/i;

/** Adjetivos valorativos: NO alcanzan solos (un "aroma natural" sigue siendo
 *  un aroma). Se sacan y se intenta clasificar lo que queda. */
export const VALUATIVE_ADJECTIVES =
  /\b(natural(?:es)?|exclusiv[oa]s?|seleccionad[oa]s?|premium|ancestral(?:es)?|artesanal(?:es)?|gourmet|especial(?:es)?|superior(?:es)?|de primera|de calidad|puro seleccionado)\b/gi;

export const UNIDENTIFIED_DESC =
  'No pudimos identificar este ingrediente. Puede ser una denominación comercial o un término que no reconocemos.';

export const OPACITY_NOTE =
  'Fitogenix penaliza la opacidad. Un fabricante que elige no decirnos qué contiene su producto no recibe el beneficio de la duda. Que la frase suene bien no es información.';

/** "Ingredientes:" se busca en los primeros 200 caracteres (el preámbulo de marketing puede
 *  ser largo); si no aparece, el texto se toma entero. */
export const INGREDIENTS_PREAMBLE = /^[\s\S]{0,200}?\bingr(?:edientes?)?\s*[:.]+\s*/i;

/** Ruido de rotulado que no es parte del nombre del ingrediente. */
export const LABEL_NOISE =
  /\b(?:m[ií]n(?:imo)?|m[aá]x(?:imo)?|aprox(?:imadamente)?|c\.?s\.?p\.?|c\.?s\.?|en proporci[oó]n variable|elaborado por|contenido neto)\b\.?/gi;

/* ---------------------------------------------------------------
   Seccion 8 - Abreviaturas del rotulado argentino
   --------------------------------------------------------------- */

/** Clase de aditivo abreviada del rotulado nacional ("COL 150 d", "ACI 338", "ARO"), que
 *  el documento no contempla. */
export const LABEL_ABBREVIATIONS: readonly { prefix: RegExp; label: string }[] = [
  { prefix: /^col\b/i,  label: 'Colorante' },
  { prefix: /^aro\b/i,  label: 'Aroma' },
  { prefix: /^aci\b/i,  label: 'Acidulante' },
  { prefix: /^cons\b/i, label: 'Conservante' },
  { prefix: /^est\b/i,  label: 'Estabilizante' },
  { prefix: /^edu\b/i,  label: 'Edulcorante' },
  { prefix: /^ant\b/i,  label: 'Antioxidante' },
  { prefix: /^emu\b/i,  label: 'Emulsionante' },
  { prefix: /^esp\b/i,  label: 'Espesante' },
  { prefix: /^hum\b/i,  label: 'Humectante' },
  { prefix: /^ega\b/i,  label: 'Estabilizante de gases' },
  { prefix: /^res\b/i,  label: 'Regulador de acidez' },
  { prefix: /^leu\b/i,  label: 'Leudante' },
  { prefix: /^ana\b/i,  label: 'Antiaglomerante' },
];
