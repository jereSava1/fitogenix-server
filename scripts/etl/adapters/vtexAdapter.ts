import type { RawOFFProduct } from '../../../src/types/fitogenix';
import { normalizeBarcode } from '../lib/barcode';

// Shape parcial de la respuesta de `GET /api/catalog_system/pub/products/search`
// de VTEX. Confirmado en vivo contra jumbo.com.ar, disco.com.ar, vea.com.ar y
// carrefour.com.ar (recon 2026-08-06) — los 4 responden JSON sin auth con esta
// forma general. Solo tipamos los campos que usamos; si algún retailer difiere
// en un campo opcional, verificar contra una respuesta real de ESE dominio
// antes de correr en volumen (no asumir que los 4 son 100% idénticos).
type VtexItem = {
  itemId?: string;
  ean?: string;
  images?: { imageUrl?: string }[];
};
type VtexProduct = {
  productName?: string;
  brand?: string;
  categories?: string[]; // ej. ["/Almacén/Galletitas Dulces/"]
  items?: VtexItem[];
  // Cencosud (Jumbo/Disco/Vea) publica estos tres; Carrefour no. Vienen como
  // arrays de UN string que contiene un repr de Python (comillas simples), no
  // JSON — hay que parsearlos a mano.
  Ingredientes?: string[];
  'Tabla Nutricional'?: string[];
  Sellos?: string[];
};

/**
 * "'harina de trigo', 'manteca', 'azúcar'" → "harina de trigo, manteca, azúcar"
 *
 * Cencosud entrega la lista como un repr de Python dentro de un array. Se
 * normaliza al mismo formato de texto plano separado por comas que usa
 * `ingredients_text` en OFF, para que el motor no tenga que saber de dónde
 * vino el dato.
 */
export function parseVtexIngredients(field?: string[]): string | undefined {
  const raw = field?.[0]?.trim();
  if (!raw) return undefined;
  const text = raw
    .replace(/^\[|\]$/g, '')
    .replace(/'/g, '')
    .replace(/\s*,\s*/g, ', ')
    .trim();
  return text.length > 2 ? text : undefined;
}

/**
 * Mapa del panel nutricional de Cencosud a las claves `_100g` de OFF.
 * Los valores ya vienen por 100 unidades de `basic_unit_name` (se verificó
 * contra `*_per_portion`: 416.67 por 100g ↔ 125 por porción de 30g).
 */
const NUTRIENT_MAP: Record<string, string> = {
  energy_value: 'energy-kcal_100g',
  protein_value: 'proteins_100g',
  fat_total_value: 'fat_100g',
  fat_sat_value: 'saturated-fat_100g',
  fat_trans_value: 'trans-fat_100g',
  sugars_value: 'sugars_100g',
  fiber_value: 'fiber_100g',
  carbohydrate_value: 'carbohydrates_100g',
  carbohydrates_value: 'carbohydrates_100g',
};

export function parseVtexNutrition(field?: string[]): Record<string, number> | undefined {
  const raw = field?.[0];
  if (!raw) return undefined;

  // Extracción por regex en vez de JSON.parse: el string es un repr de Python
  // y convertir comillas a mano se rompe con cualquier apóstrofo en un valor.
  const out: Record<string, number> = {};
  for (const [, key, value] of raw.matchAll(/'(\w+)':\s*(-?[\d.]+)/g)) {
    const mapped = NUTRIENT_MAP[key];
    if (mapped) out[mapped] = Number(value);
  }

  // El sodio viene en mg y OFF lo expresa en gramos.
  const sodium = raw.match(/'sodium_value':\s*(-?[\d.]+)/);
  if (sodium) out['sodium_100g'] = Number(sodium[1]) / 1000;

  return Object.keys(out).length > 0 ? out : undefined;
}

/** Certificaciones (Sin TACC, vegano, libre de lactosa…) al formato de
 *  `labels_tags` de OFF. Son sellos POSITIVOS: no existen acá los octógonos
 *  de advertencia de la Ley de Góndolas, que habría que derivar del panel. */
export function parseVtexSeals(field?: string[]): string[] | undefined {
  const raw = field?.[0];
  if (!raw) return undefined;
  const codes = [...raw.matchAll(/'certification_type_code':\s*'([^']+)'/g)].map((m) => `vtex:${m[1]}`);
  const unique = [...new Set(codes)];
  return unique.length > 0 ? unique : undefined;
}

export type AdaptedProduct = { barcode: string; raw: RawOFFProduct };

/**
 * Códigos internos de balanza/PLU (productos de peso variable: verdulería,
 * fiambrería) — confirmados en el recon con prefijo '2' y 13 dígitos. No son
 * EAN reales: no matchean contra OFF y no representan un producto envasado
 * con ingredientes/tabla nutricional fija. Se descartan, no se cachean.
 */
function isInternalPluCode(ean: string): boolean {
  return ean.startsWith('2') && ean.length === 13;
}

/** "/Almacén/Galletitas Dulces/" → "Almacén > Galletitas Dulces". Mapeo a la
 * taxonomía interna de Fitogenix (equivalente a extractCategory() para OFF)
 * queda pendiente — ver Fase 3 de 06-agente-etl-data.md, "lo que no se
 * resuelve automáticamente". Por ahora se preserva el string crudo del
 * retailer, legible pero sin normalizar contra las categorías de Fitogenix. */
function cleanCategory(categories?: string[]): string | undefined {
  const first = categories?.[0];
  if (!first) return undefined;
  return first.split('/').filter(Boolean).join(' > ');
}

/**
 * Adapta un producto VTEX a una lista de RawOFFProduct — un producto puede
 * tener varios SKUs/items (ej. mismo producto en presentaciones distintas),
 * cada uno con su propio EAN, así que devuelve un array (0, 1 o más).
 *
 * CORRECCIÓN respecto de la versión anterior: se daba por sentado que "un
 * retailer nunca trae ingredientes ni tabla nutricional". Es cierto para
 * Carrefour, cuyas especificaciones son puramente comerciales, pero FALSO
 * para Cencosud (Jumbo, Disco, Vea), que publica `Ingredientes`, `Tabla
 * Nutricional` y `Sellos` en la misma respuesta que ya pedíamos. Estábamos
 * descartando datos reales y mandando esos productos al gate de completitud
 * como si fueran gaps.
 */
export function adaptVtexProduct(product: VtexProduct): AdaptedProduct[] {
  const results: AdaptedProduct[] = [];
  const category = cleanCategory(product.categories);

  for (const item of product.items ?? []) {
    const rawEan = item.ean?.trim();
    // El chequeo de PLU va sobre el crudo (prefijo '2' + 13 dígitos, definido
    // así en el recon) — normalizeBarcode no toca códigos de 13 dígitos, pero
    // el orden importa conceptualmente: PLU se descarta ANTES de normalizar.
    if (!rawEan || isInternalPluCode(rawEan)) continue;
    const ean = normalizeBarcode(rawEan);
    if (!ean) continue;

    results.push({
      barcode: ean,
      raw: {
        product_name: product.productName,
        brands: product.brand,
        image_url: item.images?.[0]?.imageUrl,
        categories: category,
        ingredients_text: parseVtexIngredients(product.Ingredientes),
        nutriments: parseVtexNutrition(product['Tabla Nutricional']),
        labels_tags: parseVtexSeals(product.Sellos),
      },
    });
  }

  return results;
}
