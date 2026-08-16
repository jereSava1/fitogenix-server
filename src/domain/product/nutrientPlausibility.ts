// Rangos físicamente plausibles de nutrientes por 100g/100ml. Vive en
// domain/ (no en scripts/etl/) porque lo usan DOS consumidores: el ETL
// (scripts/etl/lib/qualityHeuristics.ts, auditoría de `products` ya
// guardado) y el enrichment en vivo (services/claudeService.ts,
// enrichWithAI) — un valor que Claude inventa fuera de rango es el MISMO
// tipo de error que uno que llegó corrupto de una fuente externa, así que
// usan la misma validación, una sola vez, acá.
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
