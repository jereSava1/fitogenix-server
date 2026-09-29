import type { RawProduct } from '../../src/modules/catalog';
import { normalizeBarcode } from '../lib/barcode';

// Forma parcial de `GET /api/catalog_system/pub/products/search` de VTEX (jumbo, disco, vea,
// carrefour). Solo los campos que se usan; verificar contra ESE dominio antes de correr en volumen.
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

/** "'harina de trigo', 'manteca'" → "harina de trigo, manteca": Cencosud manda un repr
 *  de Python; se lleva al mismo texto plano que `ingredients_text` de OFF. */
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

/** Panel de Cencosud → claves `_100g` de OFF. Ya viene por 100 unidades de `basic_unit_name`. */
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

export type AdaptedProduct = { barcode: string; raw: RawProduct };

/** Códigos internos de balanza/PLU (prefijo '2', 13 dígitos): no son EAN reales ni productos
 *  envasados. Se descartan. */
function isInternalPluCode(ean: string): boolean {
  return ean.startsWith('2') && ean.length === 13;
}

/** "/Almacén/Galletitas Dulces/" → "Almacén > Galletitas Dulces" (sin normalizar contra
 *  las categorías de Fitogenix). */
function cleanCategory(categories?: string[]): string | undefined {
  const first = categories?.[0];
  if (!first) return undefined;
  return first.split('/').filter(Boolean).join(' > ');
}

/** Producto VTEX → un RawProduct por SKU (cada uno con su EAN). Cencosud trae ingredientes,
 *  tabla nutricional y sellos; Carrefour, solo datos comerciales. */
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
