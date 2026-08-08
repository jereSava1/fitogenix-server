// Normaliza códigos de barra a EAN-13 — el estándar de facto en retail
// argentino/LatAm. UPC-A (12 dígitos, EEUU) es matemáticamente un EAN-13 con
// un '0' adelante — mismo código real, dos representaciones de texto
// distintas. Sin esto, el mismo producto físico que llega por OFF como
// UPC-A y por un retailer local como EAN-13 (o viceversa) generaría DOS
// filas distintas en `products` para el mismo item — el merge por barcode
// exacto (Fase 3b) nunca los agruparía.
//
// GTIN-8 (8 dígitos) y GTIN-14 (14 dígitos, cajas/pallets) se dejan como
// están: no hay ambigüedad UPC-A/EAN-13 en esos largos, y no es un caso que
// se haya visto en el catálogo argentino.
//
// ALCANCE — esto es interno al pipeline ETL (products_staging → merge →
// products), NO toca el lookup en vivo por scan. `productLookupService.
// lookupProduct` usa el string tal cual lo manda el celular, sin normalizar
// (ver 06-agente-etl-data.md). Si un producto ETL queda guardado en un
// formato que el scan en vivo nunca produce para ESE código, simplemente no
// se encuentra por barcode ahí (cae al cold path normal — no rompe nada),
// pero no cierra el círculo completo. Normalizar también el lookup en vivo
// es un cambio aparte en código hot-path, que requiere ok explícito.
export function normalizeBarcode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\d{8,14}$/.test(trimmed)) return null;
  if (trimmed.length === 12) return `0${trimmed}`;
  return trimmed;
}
