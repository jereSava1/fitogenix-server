// Reparación de códigos de barras inválidos de `products` (puro). Un código de 9 a 11 dígitos es
// casi siempre un UPC-A al que el supermercado le recortó el cero inicial; el relleno lo valida el
// dígito verificador que el código ya trae, no uno calculado.
import { hasValidGtinCheckDigit } from './barcode';

export type RepairRow = {
  id: string;
  barcode: string | null;
  data_source: string | null;
  product_name: string | null;
  ingredients_text: string | null;
  nutriments: Record<string, unknown> | null;
};

/** El código completado con ceros hasta 13 dígitos, si es de 9 a 11 dígitos y el verificador da bien. */
export function zeroPaddedCandidate(barcode: string | null): string | null {
  if (!barcode || !/^\d{9,11}$/.test(barcode)) return null;
  const padded = barcode.padStart(13, '0');
  return hasValidGtinCheckDigit(padded) ? padded : null;
}

/** ¿La fila trae ingredientes o nutrientes? */
export function hasContent(row: Pick<RepairRow, 'ingredients_text' | 'nutriments'>): boolean {
  return Boolean(row.ingredients_text?.trim()) || Object.keys(row.nutriments ?? {}).length > 0;
}

/** Muestra reproducible: ordenada por id, una de cada N, hasta `size` filas. */
export function reproducibleSample<T extends { id: string }>(rows: T[], size: number): T[] {
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
  if (sorted.length <= size) return sorted;
  const step = Math.floor(sorted.length / size);
  return sorted.filter((_, i) => i % step === 0).slice(0, size);
}

export type DuplicateVerdict = 'borrar' | 'lista';

/** Choque con otra fila que ya tiene el código completo: solo se borra la inválida si está vacía,
 *  nadie la referencia y la otra tiene al menos lo mismo (la inválida no aporta nada). */
export function duplicateVerdict(invalid: RepairRow, other: RepairRow, referenced: boolean): DuplicateVerdict {
  return !hasContent(invalid) && !referenced && other.id !== invalid.id ? 'borrar' : 'lista';
}
