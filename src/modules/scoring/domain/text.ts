// Utilidades de texto puras, sin noción de ingredientes: base del matching.

/** Caracteres que cuentan como "parte de una palabra" para los bordes. */
const WORDISH = /[\p{L}\p{N}]/u;

/** Sufijos que aceptamos pegados al alias. Sin esto, "azucares" dejaría de
 *  matchear el alias "azucar". */
const PLURAL_SUFFIXES = ['', 's', 'es'] as const;

/** §6.3: minúsculas, sin acentos, espacios colapsados. Se aplica a los dos lados del match. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Posición de `phrase` como palabra completa en `haystack`, o -1. Posición y no booleano:
 *  hay que detectar varias sustancias en un mismo fragmento sin que se pisen. */
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

/** El final cae en borde de palabra o después de un plural. El plural solo se tolera al
 *  final ("aceites vegetales" necesita su propio alias). */
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

/** Primera letra en mayúscula; baja a oración solo si todo viene en mayúsculas. */
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
