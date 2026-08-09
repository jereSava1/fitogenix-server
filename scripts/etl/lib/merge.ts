import type { RawOFFProduct } from '../../../src/types/fitogenix';

export type StagingEntry = { source: string; raw: RawOFFProduct };

// Prioridad de fuente para el merge campo a campo — Fase 3b de
// 06-agente-etl-data.md. Dato real (OFF/OBF/Edamam) siempre gana sobre
// scraper de retailer; scraper siempre gana sobre sintético/IA. Cualquier
// fuente no listada (carrefour, jumbo, disco, vea, ...) cae en
// DEFAULT_SCRAPER_PRIORITY — no hace falta declarar cada retailer acá.
const SOURCE_PRIORITY: Record<string, number> = {
  off: 100,
  obf: 90,
  edamam: 80,
  synthetic: 10,
  ai: 10,
  // La fila que YA está en `products`, tratada como una fuente más. Prioridad
  // mínima: solo se usa para campos que ninguna otra fuente puede llenar.
  // Sin esto el merge RESTA — reconstruye el producto solo desde staging y
  // pisa con null lo que había llegado por otro camino (un escaneo en vivo,
  // el enriquecimiento por EAN, una imagen traída de la API de OFF).
  existing: 1,
};
const DEFAULT_SCRAPER_PRIORITY = 50;

function priorityOf(source: string): number {
  return SOURCE_PRIORITY[source] ?? DEFAULT_SCRAPER_PRIORITY;
}

function nonEmpty(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

/**
 * ¿El valor SIRVE para ese campo, o es relleno?
 *
 * "No vacío" no alcanza. OFF tiene prioridad 100, así que un
 * `product_name: "00001017"` —técnicamente no vacío— le ganaba al nombre real
 * que traía el retailer. De ahí salían los productos con el código de barras
 * en el nombre y la marca vacía: el dato bueno estaba disponible y el merge
 * elegía el malo.
 */
function isUsable(field: keyof RawOFFProduct, v: unknown, barcode?: string): boolean {
  if (!nonEmpty(v)) return false;
  const s = typeof v === 'string' ? v.trim() : '';

  switch (field) {
    case 'product_name':
      // El código de barras no es un nombre, y una tira de dígitos tampoco.
      if (barcode && s.toLowerCase() === barcode.trim().toLowerCase()) return false;
      if (/^\d{6,}$/.test(s)) return false;
      return s.length > 2;

    case 'brands':
      // El string "null" llega de verdad desde algunas fuentes.
      return s.toLowerCase() !== 'null' && s.length >= 2;

    case 'image_url':
    case 'image_front_url':
      return /^https?:\/\//i.test(s);

    case 'ingredients_text':
      // Mismo umbral que el gate de completitud: menos que esto no es una
      // lista de ingredientes.
      return s.length > 4;

    default:
      return true;
  }
}

/**
 * Prioridad de fuente POR CAMPO, cuando difiere de la global.
 *
 * La global (OFF primero) es correcta para ingredientes y nutrición: en OFF
 * están curados. Para la IMAGEN es al revés — los retailers publican
 * fotografía de producto sobre fondo blanco y OFF trae fotos de celular
 * subidas por usuarios. Medido: los retailers traen imagen en el 100% de sus
 * filas y OFF en el 0% de las del dump.
 */
const FIELD_PRIORITY: Partial<Record<keyof RawOFFProduct, Record<string, number>>> = {
  image_url: { off: 40, obf: 40 },
  image_front_url: { off: 40, obf: 40 },
};

/**
 * Mergea N RawOFFProduct del MISMO barcode, campo a campo, por prioridad de
 * fuente (Fase 3b). Ejemplo: si OFF no trae `image_url` pero el scraper de
 * Jumbo sí, el resultado final lleva la imagen de Jumbo aunque el resto del
 * producto sea de OFF.
 *
 * `nutriments` es la EXCEPCIÓN a "campo a campo": se toma como bloque atómico
 * de una sola fuente (la de mejor prioridad que lo traiga). Mezclar valores
 * nutricionales de fuentes distintas — que pueden medir en bases distintas —
 * produciría una tabla internamente inconsistente, peor que no tener el dato.
 */
export function mergeRawProducts(entries: StagingEntry[], barcode?: string): RawOFFProduct {
  const sorted = [...entries].sort((a, b) => priorityOf(b.source) - priorityOf(a.source));

  const pick = <K extends keyof RawOFFProduct>(field: K): RawOFFProduct[K] | undefined => {
    const override = FIELD_PRIORITY[field];
    const order = override
      ? [...entries].sort(
          (a, b) =>
            (override[b.source] ?? priorityOf(b.source)) - (override[a.source] ?? priorityOf(a.source)),
        )
      : sorted;

    for (const { raw } of order) {
      if (isUsable(field, raw[field], barcode)) return raw[field];
    }
    return undefined;
  };

  return {
    product_name: pick('product_name'),
    brands: pick('brands'),
    image_url: pick('image_url'),
    image_front_url: pick('image_front_url'),
    ingredients_text: pick('ingredients_text'),
    nutriments: pick('nutriments'), // bloque atómico — ver comentario arriba
    nova_group: pick('nova_group'),
    additives_tags: pick('additives_tags'),
    labels_tags: pick('labels_tags'),
    categories: pick('categories'),
    quantity: pick('quantity'),
    serving_size: pick('serving_size'),
    // Solo es "puramente IA" si TODAS las filas que contribuyeron lo eran —
    // basta que una sola fuente real haya aportado algo para que esto sea false.
    _aiSource: sorted.length > 0 && sorted.every((e) => e.raw._aiSource === true),
  };
}

/** Fuente de mayor prioridad entre las que contribuyeron — para `data_source` final. */
export function primarySourceOf(entries: StagingEntry[]): string {
  const sorted = [...entries].sort((a, b) => priorityOf(b.source) - priorityOf(a.source));
  return sorted[0]?.source ?? 'off';
}
