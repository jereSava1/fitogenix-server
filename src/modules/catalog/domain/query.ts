// Normalización compartida de queries de texto: minúsculas, sin acentos (NFD),
// espacios colapsados. Función pura del dominio del catálogo: la usan
// nameKey (abajo) y el lector de Supabase (búsqueda por nombre). Antes era
// services/queryNormalization.ts (M-04). El cache Redis todavía normaliza distinto: se unifica en H-04.
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/\s+/g, ' ')
    .trim();
}

// Clave INTERNA (Redis/in-flight/logs) para búsquedas por nombre. Normaliza
// (minúsculas, sin acentos, espacios colapsados) para maximizar hits entre
// búsquedas equivalentes, y prefija 'name:' para no colisionar con barcodes.
// Antes vivía en productLookupService (M-05).
export function nameKey(query: string): string {
  return `name:${normalizeQuery(query)}`;
}

// Un query es un código de barras si son solo 8 a 14 dígitos (EAN-8 a
// GTIN-14). Se evalúa sobre el query ya recortado. Antes era una regex inline
// en productLookupService (M-05).
export function isBarcode(query: string): boolean {
  return /^\d{8,14}$/.test(query);
}
