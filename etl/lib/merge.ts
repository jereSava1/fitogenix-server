import type { RawProduct } from '../../src/modules/catalog';
import { hasNutrientData } from './completeness';

export type StagingEntry = { source: string; raw: RawProduct };

// Prioridad de fuente: dato real (OFF/OBF/Edamam) > scraper de retailer > IA. Una fuente no
// listada cae en DEFAULT_SCRAPER_PRIORITY.
const SOURCE_PRIORITY: Record<string, number> = {
  off: 100,
  obf: 90,
  edamam: 80,
  synthetic: 10,
  ai: 10,
  // La fila que ya está en `products`, con prioridad mínima: solo llena lo que ninguna otra
  // fuente trae. Sin esto el merge pisaría con null datos que llegaron por otro camino.
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

/** ¿El valor sirve para el campo o es relleno? (un `product_name` que es el barcode no sirve). */
function isUsable(field: keyof RawProduct, v: unknown, barcode?: string): boolean {
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

    case 'nutriments':
      // Un bloque sin nutrientes (solo `nova-group`, por ejemplo) no le gana a una tabla real.
      return hasNutrientData(v as Record<string, unknown>);

    case 'ingredients_text':
      // Mismo umbral que el gate de completitud: menos que esto no es una
      // lista de ingredientes.
      return s.length > 4;

    default:
      return true;
  }
}

/** Prioridad por campo cuando difiere de la global: para la imagen ganan los retailers
 *  (foto de producto) sobre OFF (fotos de usuarios). */
const FIELD_PRIORITY: Partial<Record<keyof RawProduct, Record<string, number>>> = {
  image_url: { off: 40, obf: 40 },
  image_front_url: { off: 40, obf: 40 },
};

/** Mergea los RawProduct de un mismo barcode, campo a campo por prioridad. `nutriments` va
 *  en bloque de una sola fuente: mezclar bases distintas daría una tabla inconsistente. */
export function mergeRawProducts(entries: StagingEntry[], barcode?: string): RawProduct {
  const sorted = [...entries].sort((a, b) => priorityOf(b.source) - priorityOf(a.source));

  const pick = <K extends keyof RawProduct>(field: K): RawProduct[K] | undefined => {
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

  // La base viaja con el bloque de nutrición, de la misma fuente: nunca se mezcla.
  const nutriments = pick('nutriments');
  const basis = nutriments
    ? entries.find((e) => e.raw.nutriments === nutriments)?.raw.nutrition_basis
    : undefined;

  return {
    product_name: pick('product_name'),
    brands: pick('brands'),
    image_url: pick('image_url'),
    image_front_url: pick('image_front_url'),
    ingredients_text: pick('ingredients_text'),
    nutriments, // bloque atómico — ver comentario arriba
    ...(basis ? { nutrition_basis: basis } : {}),
    additives_tags: pick('additives_tags'),
    labels_tags: pick('labels_tags'),
    categories: pick('categories'),
    quantity: pick('quantity'),
    serving_size: pick('serving_size'),
  };
}

/** Fuente de mayor prioridad entre las que contribuyeron — para `data_source` final. */
export function primarySourceOf(entries: StagingEntry[]): string {
  const sorted = [...entries].sort((a, b) => priorityOf(b.source) - priorityOf(a.source));
  return sorted[0]?.source ?? 'off';
}
