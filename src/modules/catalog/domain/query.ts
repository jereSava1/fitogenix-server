// Normalización compartida de queries de texto: minúsculas, sin acentos (NFD),
// espacios colapsados. Función pura del dominio del catálogo: la usan
// productLookupService (nameKey) y los adaptadores de Supabase (búsqueda por
// nombre y upgrade name→barcode). Antes era services/queryNormalization.ts
// (M-04). El cache Redis todavía normaliza distinto: se unifica en H-04.
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/\s+/g, ' ')
    .trim();
}
