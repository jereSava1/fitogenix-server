/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Octógonos de advertencia (Ley 27.642 / Decreto 151/2022)

   Argentina adoptó el perfil de nutrientes de OPS: los sellos negros no son
   una opinión sino el resultado de aplicar umbrales fijos sobre la tabla
   nutricional. Por eso los CALCULAMOS en vez de leerlos — el campo "Sellos"
   de los retailers trae certificaciones positivas (Sin TACC, vegano), no
   advertencias.

   Son el único dato del producto que el usuario puede VERIFICAR mirando el
   envase. Nuestro puntaje no; por eso viven en su propio módulo y se exponen
   aparte, aunque además alimenten el modificador nutricional.

   ANTES DE PUBLICITAR ESTO como "los sellos oficiales" conviene contrastar
   los umbrales contra el texto del decreto: si alguno cambió, se corrige acá
   y en ningún otro lado.
═══════════════════════════════════════════════════════════ */

import type { WarningSeal } from './types';

/** Aporte energético por gramo, para los umbrales expresados en % de energía. */
const KCAL_PER_GRAM = { sugar: 4, fat: 9 } as const;

/** Fracción de la energía total a partir de la cual el sello aplica. */
const ENERGY_SHARE = { sugars: 0.1, satFat: 0.1, totalFat: 0.3 } as const;

/** mg de sodio por kcal. */
const SODIUM_PER_KCAL = 1;

/** kcal/100 — el umbral de líquidos es distinto al de sólidos. */
const CALORIE_LIMIT = { solid: 275, liquid: 70 } as const;

export interface SealInput {
  readonly kcal100: number | null;
  readonly sugars100: number | null;
  readonly satFat100: number | null;
  readonly totalFat100: number | null;
  readonly sodiumMg100: number | null;
  readonly isLiquid: boolean;
  /**
   * La ley habla de azúcares LIBRES y el panel declara azúcares TOTALES. No
   * son lo mismo —la leche y la fruta tienen azúcares que no son libres— así
   * que este sello se aplica solo cuando el listado delata azúcar añadida.
   */
  readonly hasAddedSugar: boolean;
}

/**
 * Los sellos que le corresponden a este panel.
 *
 * Sin energía declarada no se pueden calcular los porcentajes y no se asume
 * nada: un producto sin panel no lleva sellos, igual que en la góndola.
 */
export function computeWarningSeals(input: SealInput): WarningSeal[] {
  const { kcal100, sugars100, satFat100, totalFat100, sodiumMg100 } = input;
  const seals: WarningSeal[] = [];

  const energy = kcal100 != null && kcal100 > 0 ? kcal100 : null;
  const sharesOf = (grams: number | null, kcalPerGram: number, limit: number): boolean =>
    energy != null && grams != null && (grams * kcalPerGram) / energy >= limit;

  if (input.hasAddedSugar && sharesOf(sugars100, KCAL_PER_GRAM.sugar, ENERGY_SHARE.sugars)) {
    seals.push('EXCESO EN AZÚCARES');
  }
  if (sharesOf(satFat100, KCAL_PER_GRAM.fat, ENERGY_SHARE.satFat)) {
    seals.push('EXCESO EN GRASAS SATURADAS');
  }
  if (sharesOf(totalFat100, KCAL_PER_GRAM.fat, ENERGY_SHARE.totalFat)) {
    seals.push('EXCESO EN GRASAS TOTALES');
  }
  if (energy != null && sodiumMg100 != null && sodiumMg100 / energy >= SODIUM_PER_KCAL) {
    seals.push('EXCESO EN SODIO');
  }
  if (kcal100 != null && kcal100 >= (input.isLiquid ? CALORIE_LIMIT.liquid : CALORIE_LIMIT.solid)) {
    seals.push('EXCESO EN CALORÍAS');
  }

  return seals;
}

/**
 * Cuánto resta el conjunto de sellos, con retornos decrecientes.
 *
 * Un producto con cinco sellos es peor que uno con dos, pero no dos veces y
 * media peor — y sin el decaimiento cualquier snack se hunde al piso y deja de
 * distinguirse del resto de la banda baja, que es justo lo que el puntaje
 * tiene que discriminar.
 */
export const SEAL_PENALTY = { first: 7, decay: 0.6, max: 20 } as const;

export function sealPenalty(seals: readonly WarningSeal[]): number {
  const total = seals.reduce(
    (acc, _seal, i) => acc + SEAL_PENALTY.first * Math.pow(SEAL_PENALTY.decay, i),
    0,
  );
  return Math.min(SEAL_PENALTY.max, Math.round(total));
}
