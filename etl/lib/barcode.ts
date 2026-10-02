// Normaliza a EAN-13: un UPC-A (12 dígitos) es el mismo código con un '0' adelante, y sin
// esto el merge por barcode lo tomaría como otro producto. GTIN-8 y GTIN-14 quedan igual.
// Solo para el ETL: el lookup en vivo busca el barcode tal cual llega.
export function normalizeBarcode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\d{8,14}$/.test(trimmed)) return null;
  if (trimmed.length === 12) return `0${trimmed}`;
  return trimmed;
}
