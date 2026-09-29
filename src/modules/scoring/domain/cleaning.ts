// §6 "Antes de evaluar: limpiar la lista": parseo del rotulado, en el orden del documento
// (alérgenos, traducción, normalización, "y/o", paréntesis).

import { normalizeText } from './text';
import {
  ALLERGEN_PREAMBLE,
  AND_OR_SEPARATOR,
  CERTIFICATION_PATTERNS,
  INGREDIENTS_PREAMBLE,
  LABEL_NOISE,
} from './rubric';
import type { CleanIngredient, CleanedList } from './types';

/** Largo máximo de un fragmento. Por encima se recorta (no se descarta): es
 *  una lista corrida sin separadores, no basura. */
const MAX_FRAGMENT_LENGTH = 90;

/** Cinturón de seguridad contra parseos patológicos (cientos de fragmentos).
 *  No es una regla de producto. */
const MAX_ITEMS = 60;

/** Mínimo de letras para que un fragmento describa algo. */
const MIN_LETTERS = 3;

/** Un código de aditivo dice exactamente qué es con cuatro caracteres. */
const ADDITIVE_CODE = /^(?:e|ins)\s?\d{3,4}\s?[a-d]?$/i;

/** ¿El motor reconoce esta cadena? Se le pregunta al motor para no duplicar la clasificación. */
export type ResolvesPredicate = (text: string) => boolean;

/* ────────────────────────────────────────────────────────────
   Paso 1 — Advertencias de alérgenos
   ──────────────────────────────────────────────────────────── */

interface AllergenSplit {
  readonly list: string;
  readonly warnings: readonly string[];
}

/** §6.1: desde la PRIMERA "puede contener", "trazas de", "elaborado en" o "alérgenos:",
 *  todo es advertencia. Se evalúa lo que el fabricante eligió poner, no las trazas. */
function splitAllergenWarnings(text: string): AllergenSplit {
  const match = ALLERGEN_PREAMBLE.exec(text);
  if (!match) return { list: text, warnings: [] };

  const warning = text.slice(match.index).trim().replace(/[.;]\s*$/, '');
  return { list: text.slice(0, match.index), warnings: warning ? [warning] : [] };
}

/* ────────────────────────────────────────────────────────────
   Paso 3 — Normalizar y separar
   ──────────────────────────────────────────────────────────── */

/** Separadores de §6.3 más dos del rotulado real: ". " (sin tocar decimales) y ":" en medio
 *  de la lista (OCR). El guion solo con espacios alrededor ("E-471" es uno). */
const SEPARATORS = /[,;:\r\n]|\s[-–—]\s|\.(?=\s|$)/;

function splitFragments(text: string): string[] {
  return text
    .split(SEPARATORS)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

interface StrippedFragment {
  readonly text: string;
  readonly percent?: number;
}

/** Saca el ruido del rotulado y rescata el porcentaje declarado, que la regla
 *  de dominancia de §3 necesita. */
function stripNoise(fragment: string): StrippedFragment {
  const declared = fragment.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
  const percent = declared ? parseFloat(declared[1].replace(',', '.')) : undefined;

  const text = fragment
    .replace(/\d{1,3}(?:[.,]\d+)?\s*%/g, ' ')
    .replace(LABEL_NOISE, ' ')
    .replace(/[*_†‡]/g, ' ')
    .replace(/^[\s\-–—:·•]+|[\s\-–—:·•]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return percent != null ? { text, percent } : { text };
}

/** ¿Dice algo este fragmento? Un código de aditivo sí, aunque sea cortísimo:
 *  sin esta excepción "E110" se caía de la lista en silencio y el producto
 *  perdía sus aditivos justo antes de puntuar. */
function isMeaningful(text: string): boolean {
  if (ADDITIVE_CODE.test(text)) return true;
  return (text.match(/\p{L}/gu) ?? []).length >= MIN_LETTERS;
}

/** §4.7 — "Certificaciones: no son ingredientes." */
function isCertification(text: string): boolean {
  return CERTIFICATION_PATTERNS.some((pattern) => pattern.test(text.trim()));
}

/* ────────────────────────────────────────────────────────────
   Paso 4 — Resolver "y/o"
   ──────────────────────────────────────────────────────────── */

/** §6.4 — "girasol y/o soja" es UN ingrediente. El motor se queda con la
 *  clasificación del PEOR de los declarados; acá solo se registran. */
function alternativesOf(text: string): string[] | undefined {
  if (!AND_OR_SEPARATOR.test(text)) return undefined;
  const parts = text.split(AND_OR_SEPARATOR).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts : undefined;
}

/* ────────────────────────────────────────────────────────────
   Paso 5 — Aplanar los paréntesis
   ──────────────────────────────────────────────────────────── */

interface Fragment {
  readonly text: string;
  readonly nested: boolean;
}

/** §6.5: los contenedores ("relleno", "cobertura de…") se reemplazan por sus componentes,
 *  solo si lo de adentro resuelve: "leche entera (origen Argentina)" conserva la leche. */
function flattenParentheses(text: string, resolves: ResolvesPredicate): Fragment[] {
  const out: Fragment[] = [];
  let buffer = '';
  let inner = '';
  let depth = 0;

  const flush = (dropContainer: boolean) => {
    const pending = buffer.trim().replace(/[,;]\s*$/, '').trim();
    buffer = '';
    if (!pending || dropContainer) return;
    // El buffer puede traer más de un ingrediente adentro cuando el separador
    // no fue una coma (dos puntos, guion suelto): se vuelve a partir acá.
    for (const part of splitFragments(pending)) out.push({ text: part, nested: false });
  };

  for (const char of text) {
    if (char === '(' || char === '[') {
      if (depth === 0) { inner = ''; depth = 1; continue; }
      depth += 1;
      inner += char;
      continue;
    }

    if ((char === ')' || char === ']') && depth > 0) {
      depth -= 1;
      if (depth > 0) { inner += char; continue; }

      const parts = splitFragments(inner);
      const isSublist = parts.some(resolves);
      flush(isSublist);
      if (isSublist) for (const part of parts) out.push({ text: part, nested: true });
      inner = '';
      continue;
    }

    if (depth > 0) { inner += char; continue; }

    if (char === ',' || char === ';' || char === '\n' || char === '\r') { flush(false); continue; }
    buffer += char;
  }

  // Paréntesis sin cerrar: no se pierde el contenido.
  if (depth > 0 && inner.trim()) {
    for (const part of splitFragments(inner)) out.push({ text: part, nested: true });
  }
  flush(false);

  return out;
}

/* ────────────────────────────────────────────────────────────
   Entrada principal
   ──────────────────────────────────────────────────────────── */

/** Texto crudo de la etiqueta → lista limpia, numerada y deduplicada. Pura. */
export function cleanIngredientList(
  ingredientsText: string | undefined,
  resolves: ResolvesPredicate,
): CleanedList {
  const source = (ingredientsText ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(INGREDIENTS_PREAMBLE, '');

  const { list, warnings } = splitAllergenWarnings(source);

  const items: CleanIngredient[] = [];
  const certificationsRemoved: string[] = [];
  const seenAt = new Map<string, number>();

  for (const fragment of flattenParentheses(list, resolves)) {
    if (items.length >= MAX_ITEMS) break;

    const { text: cleaned, percent } = stripNoise(fragment.text);
    if (!cleaned) continue;

    if (isCertification(cleaned)) { certificationsRemoved.push(cleaned); continue; }
    if (!isMeaningful(cleaned)) continue;

    const text = cleaned.length > MAX_FRAGMENT_LENGTH
      ? cleaned.slice(0, MAX_FRAGMENT_LENGTH).trim()
      : cleaned;
    const key = normalizeText(text);

    // §6.5: un repetido cuenta una vez, en su mejor posición (la primera); si el duplicado
    // traía el porcentaje, se rescata.
    const previous = seenAt.get(key);
    if (previous != null) {
      const original = items[previous];
      if (percent != null && original.percent == null) {
        items[previous] = { ...original, percent };
      }
      continue;
    }

    seenAt.set(key, items.length);
    items.push({
      raw: text,
      key,
      position: items.length + 1,
      ...(percent != null ? { percent } : {}),
      ...(alternativesOf(text) ? { alternatives: alternativesOf(text) } : {}),
      ...(fragment.nested ? { nested: true } : {}),
    });
  }

  return { items, allergenWarnings: warnings, certificationsRemoved };
}

/** §6.2: no hay traducción en runtime. La tabla lleva aliases en inglés y portugués que
 *  matchean la misma fila y se muestran en español: determinista, sin inventar. */
