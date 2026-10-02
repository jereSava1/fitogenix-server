// Octógonos de la Ley 27.642 (Tabla 1 del Decreto 151/2022, segunda etapa): se calculan del
// panel, verificados contra la calculadora oficial de ANMAT. Grasa trans no tiene octógono;
// la exención del art. 7 está en steps.ts. Un umbral cambia acá y en ningún otro lado.

import type { WarningSeal } from './types';

/** Aporte energético por gramo, para los umbrales expresados en % de energía. */
const KCAL_PER_GRAM = { sugar: 4, fat: 9 } as const;

/** Fracción de la energía total a partir de la cual el sello aplica. */
const ENERGY_SHARE = { sugars: 0.1, satFat: 0.1, totalFat: 0.3 } as const;

/** Sodio: dos condiciones alternativas, ≥1 mg/kcal o ≥300 mg/100 g (la segunda no depende
 *  de la energía). */
const SODIUM_PER_KCAL = 1;
const SODIUM_PER_100G = 300;
/** Bebidas sin aporte energético: ≥40 mg de sodio/100 ml. La norma usa ≤4 kcal por porción;
 *  sin porción se aproxima con ≤4 kcal/100 ml (más inclusivo). */
const SODIUM_PER_100ML_NO_ENERGY = 40;
const NO_ENERGY_KCAL = 4;

/** kcal/100: el umbral de líquidos (25) es distinto del de sólidos. */
const CALORIE_LIMIT = { solid: 275, liquid: 25 } as const;

export interface SealInput {
  readonly kcal100: number | null;
  readonly sugars100: number | null;
  readonly satFat100: number | null;
  readonly totalFat100: number | null;
  readonly sodiumMg100: number | null;
  readonly isLiquid: boolean;
  /** La ley habla de azúcares LIBRES y el panel declara TOTALES: el sello aplica solo si la
   *  lista delata azúcar añadida. */
  readonly hasAddedSugar: boolean;
}

/** Los sellos del panel. Sin energía declarada no se calcula nada: sin panel, sin sellos. */
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
  const sodiumByRatio =
    energy != null && sodiumMg100 != null && sodiumMg100 / energy >= SODIUM_PER_KCAL;
  // Exige energía declarada igual que el resto, aunque este criterio no la use
  // para calcular: es la regla del archivo —un producto sin panel no lleva
  // sellos, igual que en la góndola— y no se rompe por un umbral nuevo.
  const sodiumByMass =
    energy != null && sodiumMg100 != null && sodiumMg100 >= SODIUM_PER_100G;
  // Bebida analcohólica sin aporte energético: umbral propio y más bajo.
  const sodiumByDrinkNoEnergy =
    input.isLiquid &&
    kcal100 != null &&
    kcal100 <= NO_ENERGY_KCAL &&
    sodiumMg100 != null &&
    sodiumMg100 >= SODIUM_PER_100ML_NO_ENERGY;
  if (sodiumByRatio || sodiumByMass || sodiumByDrinkNoEnergy) {
    seals.push('EXCESO EN SODIO');
  }
  // Calorías: exige otro sello de azúcares, grasas totales o saturadas (el sodio no cuenta)
  // y superar 275 kcal/100 g o 25 kcal/100 ml (Manual Rev. I, Disp. ANMAT 11362/2024).
  const CALORIE_ENABLERS: readonly WarningSeal[] = [
    'EXCESO EN AZÚCARES',
    'EXCESO EN GRASAS TOTALES',
    'EXCESO EN GRASAS SATURADAS',
  ];
  const hasEnablingSeal = seals.some((s) => CALORIE_ENABLERS.includes(s));
  const overEnergyLimit =
    kcal100 != null && kcal100 >= (input.isLiquid ? CALORIE_LIMIT.liquid : CALORIE_LIMIT.solid);
  if (hasEnablingSeal && overEnergyLimit) {
    seals.push('EXCESO EN CALORÍAS');
  }

  return seals;
}

/** Cuánto restan los sellos, con retornos decrecientes: sin decaimiento, cualquier snack se
 *  hunde al piso y deja de distinguirse en la banda baja. */
export const SEAL_PENALTY = { first: 7, decay: 0.6, max: 20 } as const;

export function sealPenalty(seals: readonly WarningSeal[]): number {
  const total = seals.reduce(
    (acc, _seal, i) => acc + SEAL_PENALTY.first * Math.pow(SEAL_PENALTY.decay, i),
    0,
  );
  return Math.min(SEAL_PENALTY.max, Math.round(total));
}
