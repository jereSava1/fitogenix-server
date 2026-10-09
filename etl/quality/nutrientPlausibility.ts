// Rangos plausibles por 100 g/ml. Los usan la auditoría de `products` y el enriquecimiento
// con IA: un valor inventado fuera de rango es el mismo error que uno corrupto.
const NUTRIENT_RANGES: Record<string, [number, number]> = {
  'energy-kcal_100g': [0, 900],
  proteins_100g: [0, 100],
  carbohydrates_100g: [0, 100],
  sugars_100g: [0, 100],
  fat_100g: [0, 100],
  'saturated-fat_100g': [0, 100],
  'trans-fat_100g': [0, 100],
  fiber_100g: [0, 100],
  cholesterol_100g: [0, 100],
  sodium_100g: [0, 40],
};

export type ImplausibleNutrient = { field: string; value: number };

/** Campos de `nutriments` con un valor numérico fuera de rango físico
 * plausible para 100g/100ml — típicamente un error de unidad (mg vs g) si
 * viene de una fuente externa, o una alucinación si viene de un modelo. */
export function findImplausibleNutrients(
  nutriments: Record<string, unknown> | null | undefined,
): ImplausibleNutrient[] {
  if (!nutriments) return [];
  const out: ImplausibleNutrient[] = [];
  for (const [field, [min, max]] of Object.entries(NUTRIENT_RANGES)) {
    const value = readNumber(nutriments[field]);
    if (value === null) continue;
    if (value < min || value > max) out.push({ field, value });
  }
  return out;
}

/** Número finito, o texto que es solo un número con punto decimal. Cualquier otra cosa, null. */
function readNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(raw)) return Number(raw);
  return null;
}

export type NutrientInconsistencyRule =
  | 'azucares_mayor_que_carbohidratos'
  | 'saturadas_mayor_que_grasas'
  | 'trans_mayor_que_grasas'
  | 'macros_suman_mas_de_100';

export type NutrientInconsistency = { rule: NutrientInconsistencyRule; fields: string[]; values: number[] };

// Tolerancia por el redondeo de las etiquetas (0,1 g) y, para la suma, por el redondeo de tres cifras.
const RELATION_TOLERANCE_G = 0.1;
const MACROS_TOLERANCE_G = 1;

const SUBSET_RELATIONS: { rule: NutrientInconsistencyRule; part: string; whole: string }[] = [
  { rule: 'azucares_mayor_que_carbohidratos', part: 'sugars_100g', whole: 'carbohydrates_100g' },
  { rule: 'saturadas_mayor_que_grasas', part: 'saturated-fat_100g', whole: 'fat_100g' },
  { rule: 'trans_mayor_que_grasas', part: 'trans-fat_100g', whole: 'fat_100g' },
];

/** Relaciones que una tabla real no puede romper: una parte no supera al total y proteínas,
 *  carbohidratos y grasas no suman más de 100 g. Solo mira los pares con ambos datos. */
export function findNutrientInconsistencies(
  nutriments: Record<string, unknown> | null | undefined,
): NutrientInconsistency[] {
  if (!nutriments) return [];
  const out: NutrientInconsistency[] = [];

  for (const { rule, part, whole } of SUBSET_RELATIONS) {
    const a = readNumber(nutriments[part]);
    const b = readNumber(nutriments[whole]);
    if (a !== null && b !== null && a > b + RELATION_TOLERANCE_G) {
      out.push({ rule, fields: [part, whole], values: [a, b] });
    }
  }

  const macroFields = ['proteins_100g', 'carbohydrates_100g', 'fat_100g'];
  const macros = macroFields.map((f) => readNumber(nutriments[f]));
  if (macros.every((v): v is number => v !== null)) {
    const total = macros.reduce((acc, v) => acc + v, 0);
    if (total > 100 + MACROS_TOLERANCE_G) {
      out.push({ rule: 'macros_suman_mas_de_100', fields: macroFields, values: macros });
    }
  }
  return out;
}
