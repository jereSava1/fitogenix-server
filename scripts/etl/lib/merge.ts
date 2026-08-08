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
export function mergeRawProducts(entries: StagingEntry[]): RawOFFProduct {
  const sorted = [...entries].sort((a, b) => priorityOf(b.source) - priorityOf(a.source));

  const pick = <K extends keyof RawOFFProduct>(field: K): RawOFFProduct[K] | undefined => {
    for (const { raw } of sorted) {
      if (nonEmpty(raw[field])) return raw[field];
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
