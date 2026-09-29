/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Utilidades de texto

   Funciones puras sobre strings, sin ninguna noción de ingredientes ni de
   puntajes. Están separadas porque son la base de todo el matching y porque
   los dos defectos más caros que tuvo el motor fueron de acá:

   · `includes()` pelado: el alias "sal" matcheaba dentro de "salame", así que
     un embutido puntuaba como sal de mesa.
   · acentos sin normalizar: "AZÚCAR" y "azucar" eran ingredientes distintos.
═══════════════════════════════════════════════════════════ */

/** Caracteres que cuentan como "parte de una palabra" para los bordes. */
const WORDISH = /[\p{L}\p{N}]/u;

/** Sufijos que aceptamos pegados al alias. Sin esto, "azucares" dejaría de
 *  matchear el alias "azucar". */
const PLURAL_SUFFIXES = ['', 's', 'es'] as const;

/**
 * §6.3 — Normalizar: minúsculas, sin acentos, espacios colapsados.
 *
 * Se aplica a los DOS lados del match (alias y texto), así la tabla de §4 no
 * necesita duplicar cada entrada con y sin tilde.
 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Posición donde `phrase` aparece en `haystack` como palabra (o frase)
 * completa, o `-1`.
 *
 * Devuelve la posición y no un booleano porque el motor necesita detectar
 * VARIAS sustancias dentro de un mismo fragmento sin que se pisen entre sí:
 * cuando el OCR se come una coma, "AGUA CARBONATADA AZUCARES" llega como un
 * fragmento solo.
 *
 * Ambos extremos tienen que caer en un borde de palabra, con la salvedad del
 * plural.
 */
export function indexOfPhrase(haystack: string, phrase: string): number {
  if (!phrase) return -1;

  for (let from = 0; ; ) {
    const at = haystack.indexOf(phrase, from);
    if (at < 0) return -1;

    if (startsAtWordBoundary(haystack, at) && endsAtWordBoundary(haystack, at + phrase.length)) {
      return at;
    }
    from = at + 1;
  }
}

/** ¿`phrase` aparece en `haystack` como palabra (o frase) completa? */
export function matchesPhrase(haystack: string, phrase: string): boolean {
  return indexOfPhrase(haystack, phrase) >= 0;
}

function startsAtWordBoundary(haystack: string, at: number): boolean {
  const before = at > 0 ? haystack[at - 1] : '';
  return !before || !WORDISH.test(before);
}

/**
 * El final puede caer justo en el borde o después de un plural.
 *
 * LIMITACIÓN CONOCIDA: el plural se tolera solo al final de la frase. En
 * "aceites vegetales" la ese va en el medio, así que el alias singular
 * "aceite vegetal" no matchea y la tabla lista las dos formas a mano. Si eso
 * se vuelve molesto, el arreglo es normalizar a singular antes de indexar, no
 * relajar los bordes de palabra.
 */
function endsAtWordBoundary(haystack: string, at: number): boolean {
  const rest = haystack.slice(at);
  return PLURAL_SUFFIXES.some((suffix) => {
    if (!rest.startsWith(suffix)) return false;
    const after = rest[suffix.length] ?? '';
    return !after || !WORDISH.test(after);
  });
}

/** ¿Alguno de estos términos aparece en el texto, como palabra completa? */
export function matchesAnyTerm(text: string, terms: readonly string[]): boolean {
  const normalized = normalizeText(text);
  return terms.some((term) => matchesPhrase(normalized, normalizeText(term)));
}

/**
 * Primera letra en mayúscula.
 *
 * El rotulado viene muchas veces en mayúsculas de imprenta y mostrarlo tal
 * cual grita. Se baja a oración solo en ese caso: si el texto ya trae
 * minúsculas, el fabricante escribió algo intencional y no se toca.
 */
export function toSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const isShouting = !/[a-záéíóúüñ]/.test(trimmed);
  const body = isShouting ? trimmed.slice(1).toLowerCase() : trimmed.slice(1);
  return trimmed.charAt(0).toUpperCase() + body;
}

/** Preserva el orden y saca los repetidos. */
export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
