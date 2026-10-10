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
// Un código de 9 a 11 dígitos es un UPC-A al que el supermercado le recortó el cero inicial:
// se completa con ceros hasta 13 si el dígito verificador que ya trae da bien (los ceros no lo
// cambian). Todo lo demás se descarta.
// Solo para el ETL: el lookup en vivo busca el barcode tal cual llega.
export function normalizeBarcode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^(\d{8}|\d{9,14})$/.test(trimmed)) return null;
  const code = trimmed.length >= 9 && trimmed.length <= 11 ? trimmed.padStart(13, '0') : trimmed;
  if (!hasValidGtinCheckDigit(code)) return null;
  const normalized = code.length === 12 ? `0${code}` : code;
  // GS1: los EAN-13 de prefijo 02 y 20 a 29 son de uso interno de cada comercio y no identifican un
  // producto (incluye el UPC-A de 12 dígitos que empieza con 2, que normalizado queda 02…).
  if (/^(?:02|2\d)\d{11}$/.test(normalized)) return null;
  return normalized;
}
