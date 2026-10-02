// Rangos plausibles por 100 g/ml. Los usan la auditoría de `products` y el enriquecimiento
// con IA: un valor inventado fuera de rango es el mismo error que uno corrupto.
const NUTRIENT_RANGES: Record<string, [number, number]> = {
  'energy-kcal_100g': [0, 900],
  proteins_100g: [0, 100],
  carbohydrates_100g: [0, 100],
  sugars_100g: [0, 100],
  fat_100g: [0, 100],
  'saturated-fat_100g': [0, 100],
  fiber_100g: [0, 100],
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
    const raw = nutriments[field];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    if (raw < min || raw > max) out.push({ field, value: raw });
  }
  return out;
}
