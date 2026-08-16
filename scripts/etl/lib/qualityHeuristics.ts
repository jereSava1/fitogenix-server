// Heurísticas de calidad de datos — auditoría de `products`. Todo PURO (sin
// I/O): candidatea filas sospechosas por patrón, no decide ni corrige solo.
// El job (jobs/auditDataQuality.ts) las reporta para revisión humana antes
// de tocar nada. Ver fitogenix-agents/06-agente-etl-data.md.

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

/**
 * ¿`ingredients_text` tiene pinta de dirección/boilerplate legal en vez de
 * una lista de ingredientes real? Heurística por patrones + una señal débil
 * de forma (casi sin comas para el largo del texto) que SOLO suma si ya hay
 * otra señal fuerte — así "Agua, sal" (corto, legítimo) no se marca.
 */
export function checkIngredientsText(text: string | null | undefined): IngredientsCheckResult {
  if (!text || !text.trim()) return { suspect: false, reasons: [] };
  const reasons = BOILERPLATE_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.reason);

  const commaCount = (text.match(/,/g) ?? []).length;
  if (reasons.length > 0 && commaCount <= 1 && text.length > 60) {
    reasons.push('poca estructura de lista (casi sin comas) para el largo del texto');
  }

  return { suspect: reasons.length > 0, reasons };
}

/**
 * Busca si algún brand conocido (recolectado de OTRAS filas de la propia
 * tabla) aparece como palabra completa dentro de `product_name`. Candidato a
 * "brand vacío pero está en el nombre". Case-insensitive, whole-word (evita
 * que "La" matchee dentro de otra palabra). Marcas más largas primero, para
 * que un match específico ("Molinos Río de la Plata") gane sobre uno corto
 * y genérico que también aparezca ("La"). Devuelve el brand tal cual está en
 * el diccionario, o null si no encontró nada.
 */
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

// El chequeo de rango físico plausible de nutrientes vive en
// src/domain/product/nutrientPlausibility.ts, NO acá — lo usa también
// claudeService.ts (enrichWithAI) para rechazar valores implausibles que
// Claude pueda alucinar en el enrichment en vivo, así que es domain/
// compartido, no una heurística exclusiva del ETL. Re-exportado acá para no
// romper a quien ya importaba `findImplausibleNutrients` desde este módulo.
export { findImplausibleNutrients, type ImplausibleNutrient } from '../../../src/domain/product/nutrientPlausibility';
