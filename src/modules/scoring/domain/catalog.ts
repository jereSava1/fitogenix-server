// La tabla de ingredientes de §4 (data/ingredients.ts), única puerta a ese archivo. Se
// consulta después de la rúbrica (que manda) y antes de declarar algo NO IDENTIFICADO.

import { ADDITIVES, INGREDIENTS, type Additive, type Ingredient, type Sev } from './data/ingredients';
import { matchesPhrase, normalizeText } from './text';
import type { Impact } from './types';

export type { Additive, Ingredient };

/** Severidad de la base → nivel de impacto de la rúbrica. `gray` es el único
 *  que significa "no sabemos", y por eso mapea a desconocido. */
const SEVERITY_TO_IMPACT: Readonly<Record<Sev, Impact>> = {
  red: 'alto',
  orange: 'medio',
  yellow: 'bajo',
  green: 'none',
  gray: 'desconocido',
};

interface CatalogEntry {
  readonly alias: string;
  readonly record: Ingredient;
}

/** Aliases aplanados, de más largo a más corto: el primer match es el más específico. */
const CATALOG_INDEX: readonly CatalogEntry[] = INGREDIENTS
  .flatMap((record) => record.aliases.map((alias) => ({ alias: normalizeText(alias), record })))
  .sort((a, b) => b.alias.length - a.alias.length);

/** El registro del catálogo para este texto, o `null`. */
export function findInCatalog(text: string): Ingredient | null {
  const haystack = normalizeText(text);
  for (const { alias, record } of CATALOG_INDEX) {
    // matchesPhrase, no includes(): "sal" no puede matchear dentro de "salame"
    // ni "ajo" dentro de "trabajo".
    if (matchesPhrase(haystack, alias)) return record;
  }
  return null;
}

export function impactFromCatalog(record: Ingredient): Impact {
  return SEVERITY_TO_IMPACT[record.b];
}

/** Nombre canónico en español: el primer alias ("PALM OIL" se muestra "Aceite de palma"). */
export function canonicalNameFor(text: string): string | null {
  const record = findInCatalog(text);
  if (!record) return null;
  const canonical = record.aliases[0];
  return canonical.charAt(0).toUpperCase() + canonical.slice(1);
}

/** La prosa por ingrediente, si la tenemos. */
export function descriptionFor(text: string): string | null {
  return findInCatalog(text)?.desc ?? null;
}

/** Un aditivo declarado por la base de datos con su tag normalizado. */
export function findAdditive(tag: string): Additive | undefined {
  return ADDITIVES[tag];
}
