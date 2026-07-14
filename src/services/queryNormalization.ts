// Normalización compartida de queries de texto: minúsculas, sin acentos (NFD),
// espacios colapsados. Vive en un módulo chico y sin dependencias para que
// tanto productLookupService (nameKey) como cacheService (búsqueda en catálogo)
// la importen sin riesgo de imports circulares.
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/\s+/g, ' ')
    .trim();
}
