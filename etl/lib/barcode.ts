// Dígito verificador GTIN (módulo 10): pesos 3 y 1 alternados desde la derecha, sin contar el último.
export function hasValidGtinCheckDigit(code: string): boolean {
  if (!/^\d+$/.test(code) || code.length < 2) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop() as number;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

// Normaliza a EAN-13: un UPC-A (12 dígitos) es el mismo código con un '0' adelante, y sin
// esto el merge por barcode lo tomaría como otro producto. GTIN-8 y GTIN-14 quedan igual.
// Acepta solo largos GTIN (8, 12, 13, 14) con dígito verificador correcto.
// Solo para el ETL: el lookup en vivo busca el barcode tal cual llega.
export function normalizeBarcode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^(\d{8}|\d{12,14})$/.test(trimmed)) return null;
  if (!hasValidGtinCheckDigit(trimmed)) return null;
  return trimmed.length === 12 ? `0${trimmed}` : trimmed;
}
