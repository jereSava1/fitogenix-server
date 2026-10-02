// Normalización única de queries (búsqueda en la base y claves de Redis): minúsculas,
// sin acentos, espacios colapsados.
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/\s+/g, ' ')
    .trim();
}

// Clave interna (Redis, in-flight, logs) para búsquedas por nombre. El prefijo evita
// colisiones con barcodes.
export function nameKey(query: string): string {
  return `name:${normalizeQuery(query)}`;
}

// Barcode = solo 8 a 14 dígitos (EAN-8 a GTIN-14), sobre la query ya recortada.
export function isBarcode(query: string): boolean {
  return /^\d{8,14}$/.test(query);
}
