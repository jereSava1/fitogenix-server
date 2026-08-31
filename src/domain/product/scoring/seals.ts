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

   CONTRASTADO EL 2026-08-31 contra el perfil de nutrientes de OPS —la fuente
   que la ley adopta (Ley 27.642, art. 7)— y contra la CALCULADORA OFICIAL de
   ANMAT, que es la implementación de referencia. Tabla 1 del Decreto 151/2022,
   segunda etapa (la vigente):

     ✅ azúcares ≥10% de la energía          coincide
     ✅ grasas saturadas ≥10% de la energía  coincide
     ✅ grasas totales ≥30% de la energía    coincide
     ✅ calorías ≥275 kcal/100 g (sólidos)   coincide
     🔧 sodio: la norma tiene DOS condiciones alternativas, no una
     🔧 calorías de bebidas: era 70, la norma dice 25

   Los dos últimos se corrigieron acá. Los dos erraban en la MISMA dirección
   —de menos— así que el usuario veía menos octógonos de los que su envase
   lleva, que es el peor error posible para el único dato que puede verificar.

   La salida de la calculadora oficial que lo cierra, para una bebida:

     Sodio mg/kcal   0,5   <1     N/A
     Sodio mg/100g   10    <300
     Calorías        21    <25    N/A

   Detalle y fuentes: `fitogenix-agents/nutricion/NUTRICION.md` §N3 y §N6.

   Que NO haya octógono de grasas trans es correcto y está verificado: la ley
   no la incluye entre los nutrientes críticos, a diferencia de OPS que sí la
   contempla (≥1% de la energía). Ver NUTRICION.md §N3.

   La excepción del art. 7 —alimentos in natura e ingredientes culinarios sin
   nutrientes críticos añadidos— NO se implementa acá sino en `steps.ts`
   (`applyNutrition` corta antes de llamar a esta función). Si venís a buscar
   por qué la leche entera no lleva sellos, está allá.

   Si algún umbral cambia, se corrige acá y en ningún otro lado.
═══════════════════════════════════════════════════════════ */

import type { WarningSeal } from './types';

/** Aporte energético por gramo, para los umbrales expresados en % de energía. */
const KCAL_PER_GRAM = { sugar: 4, fat: 9 } as const;

/** Fracción de la energía total a partir de la cual el sello aplica. */
const ENERGY_SHARE = { sugars: 0.1, satFat: 0.1, totalFat: 0.3 } as const;

/**
 * Sodio: la norma marca DOS condiciones alternativas, no una.
 *
 * Tabla 1 del Decreto 151/2022, segunda etapa: «≥ 1 mg de sodio por 1 kcal
 * **o** ≥ 300 mg/100 g». Verificado contra la calculadora oficial de ANMAT, que
 * evalúa las dos por separado y las muestra en filas distintas.
 *
 * La segunda no depende de la energía declarada: un producto sin panel
 * energético igual puede superarla.
 */
const SODIUM_PER_KCAL = 1;
const SODIUM_PER_100G = 300;
/**
 * Tercera condición, solo para bebidas analcohólicas SIN aporte energético:
 * ≥40 mg de sodio cada 100 ml. El Manual define "sin aporte energético" como
 * ≤4 kcal **por porción**.
 *
 * 🟡 Acá se aproxima con ≤4 kcal/100 ml, porque el motor no conoce el tamaño de
 * porción: solo tiene el panel por 100. Una porción de bebida suele ser 200 ml,
 * así que el criterio real sería ≈2 kcal/100 ml — esta aproximación es más
 * inclusiva y puede marcar alguna bebida de más. Ver NUTRICION.md §N6.
 */
const SODIUM_PER_100ML_NO_ENERGY = 40;
const NO_ENERGY_KCAL = 4;

/**
 * kcal/100 — el umbral de líquidos es distinto al de sólidos.
 *
 * `liquid` era 70, que no es ninguna de las dos etapas argentinas (50 y 25):
 * es el valor final del modelo chileno. La calculadora oficial de ANMAT
 * devuelve «Calorías 21 <25 N/A» para una bebida, así que el corte vigente es
 * 25.
 */
const CALORIE_LIMIT = { solid: 275, liquid: 25 } as const;

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
  // Las calorías NO son un nutriente crítico: son una unidad de medida. Por eso
  // su octógono exige DOS condiciones a la vez (Manual de Aplicación, Rev. I,
  // Disp. ANMAT 11362/2024, pág. 10 y 17):
  //
  //   i)  el producto ya lleva alguno de los sellos de exceso en AZÚCARES,
  //       GRASAS TOTALES o GRASAS SATURADAS  ← esta faltaba
  //   ii) supera el límite de energía (275 kcal/100 g · 25 kcal/100 ml)
  //
  // Sin (i) el motor marcaba por energía sola, y le ponía octógono de calorías
  // a productos densos que en la góndola no lo llevan. Notar que el SODIO no
  // habilita el sello de calorías: la norma nombra solo esos tres.
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
