// Heurísticas de calidad (puras): marcan filas sospechosas para revisión, no corrigen.

// Patrones típicos de texto de fábrica/legal que a veces termina pegado en
// `ingredients_text` por errores de carga comunitaria en Open Food Facts —
// no es una lista de ingredientes, es la etiqueta completa mal recortada.
const BOILERPLATE_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /elaborado\s+(por|en)/i, reason: 'contiene "elaborado por/en"' },
  { pattern: /establecimiento/i, reason: 'contiene "establecimiento"' },
  { pattern: /industria\s+argentina/i, reason: 'contiene "industria argentina"' },
  { pattern: /\bRNE\b|\bRNPA\b/i, reason: 'contiene código de registro RNE/RNPA' },
  { pattern: /parque\s+industrial/i, reason: 'contiene "parque industrial"' },
  { pattern: /\bruta\s+\d+/i, reason: 'contiene referencia a ruta (dirección)' },
  { pattern: /\bcno\.?\s/i, reason: 'contiene abreviatura de "camino" (dirección)' },
  { pattern: /\b[A-Z]\d{4}[A-Z]{3}\b/, reason: 'contiene código postal argentino (CPA)' },
  { pattern: /^(www\.|https?:\/\/)/i, reason: 'empieza con una URL' },
];

export type IngredientsCheckResult = { suspect: boolean; reasons: string[] };

/** ¿`ingredients_text` parece dirección o boilerplate legal? La señal débil (pocas comas)
 *  solo suma si hay otra fuerte, así "Agua, sal" no se marca. */
export function checkIngredientsText(text: string | null | undefined): IngredientsCheckResult {
  if (!text || !text.trim()) return { suspect: false, reasons: [] };
  const reasons = BOILERPLATE_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.reason);

  const commaCount = (text.match(/,/g) ?? []).length;
  if (reasons.length > 0 && commaCount <= 1 && text.length > 60) {
    reasons.push('poca estructura de lista (casi sin comas) para el largo del texto');
  }

  return { suspect: reasons.length > 0, reasons };
}

/** Una marca conocida (de otras filas) como palabra completa en `product_name`. Las más
 *  largas primero, para que "Molinos Río de la Plata" le gane a "La". */
export function findBrandInName(
  productName: string | null | undefined,
  knownBrands: string[],
): string | null {
  if (!productName) return null;
  const name = productName.toLowerCase();

  const sorted = [...new Set(knownBrands.map((b) => b.trim()).filter((b) => b.length >= 3))].sort(
    (a, b) => b.length - a.length,
  );

  for (const brand of sorted) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    if (re.test(name)) return brand;
  }
  return null;
}

// Re-export: el chequeo de rangos vive en quality/nutrientPlausibility.ts.
export { findImplausibleNutrients, type ImplausibleNutrient } from '../quality/nutrientPlausibility';
