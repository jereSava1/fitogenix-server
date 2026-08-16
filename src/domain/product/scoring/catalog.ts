/* ═══════════════════════════════════════════════════════════
   FITOGENIX — La tabla de §4, crecida

   §4 dice que la tabla de ingredientes "es datos, no reglas", que "crece sin
   agregar complejidad al sistema" y que "el motor consulta, no clasifica".
   `ingredientData.ts` ES esa tabla crecida: 271 registros con la prosa que
   lee el usuario, generados a partir de la base original.

   Este módulo es la única puerta a ese archivo. Se consulta DESPUÉS de la
   rúbrica —la rúbrica es la autoridad cuando tiene opinión— y ANTES de
   declarar algo NO IDENTIFICADO.

   Sin este respaldo, media góndola argentina caería en "sin datos" por la
   regla de los 3 no identificados de §1.2, que no es lo que esa sección
   quiere decir: §1.2 habla de etiquetas que no describen nada, no de
   ingredientes reales que todavía no cargamos en la rúbrica.
═══════════════════════════════════════════════════════════ */

import { ADDITIVES, INGREDIENTS, type Additive, type Ingredient, type Sev } from '../ingredientData';
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

/**
 * Todos los aliases aplanados y ordenados de más largo a más corto, para que
 * el primer match sea siempre el más específico y se pueda cortar ahí en vez
 * de recorrer los 271 registros en cada clasificación.
 */
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

/**
 * Nombre canónico en español. El primer alias siempre lo es (los de otros
 * idiomas se agregan después), así que un producto con "PALM OIL" se muestra
 * como "Aceite de palma".
 */
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
