import type { RawProduct } from '../../src/modules/catalog';
import { normalizeBarcode } from '../lib/barcode';

// Países y su tag de OFF. Por defecto solo Argentina; otros se activan con
// `--countries chile,uruguay`.
export const SUPPORTED_COUNTRY_TAGS: Record<string, string> = {
  argentina: 'en:argentina',
  chile: 'en:chile',
  uruguay: 'en:uruguay',
  mexico: 'en:mexico',
  colombia: 'en:colombia',
  brazil: 'en:brazil',
  peru: 'en:peru',
};

const DEFAULT_COUNTRY_TAGS = [SUPPORTED_COUNTRY_TAGS.argentina];

// El prefijo GS1 779 son códigos registrados en Argentina: cuentan como argentinos aunque
// OFF no tenga `countries_tags` (lo llena la comunidad, a menudo mal). Solo si Argentina
// está entre los países activos.
const AR_BARCODE_PREFIX = '779';

// Shape parcial de una línea del dump JSONL de OFF — solo lo que usamos.
type OffDumpLine = {
  code?: string;
  product_name?: string;
  brands?: string;
  image_url?: string;
  image_front_url?: string;
  ingredients_text?: string;
  nutriments?: Record<string, unknown>;
  additives_tags?: string[];
  labels_tags?: string[];
  categories?: string;
  quantity?: string;
  serving_size?: string;
  countries_tags?: string[];
};

export type AdaptedProduct = { barcode: string; raw: RawProduct };

/** Línea del dump de OFF → RawProduct, o null sin barcode válido, fuera de los países
 *  activos o sin ningún dato aprovechable (así staging no carga filas que se descartarían). */
export function adaptOffLine(
  line: OffDumpLine,
  countryTags: string[] = DEFAULT_COUNTRY_TAGS,
): AdaptedProduct | null {
  // normalizeBarcode también valida el formato (8-14 dígitos) — un barcode
  // inválido devuelve null acá.
  const barcode = normalizeBarcode(line.code ?? '');
  if (!barcode) return null;

  const countries = line.countries_tags ?? [];
  const matchesCountryTag = countries.some((tag) => countryTags.includes(tag));
  const matchesArgentinePrefix =
    countryTags.includes(SUPPORTED_COUNTRY_TAGS.argentina) && barcode.startsWith(AR_BARCODE_PREFIX);
  if (!matchesCountryTag && !matchesArgentinePrefix) return null;

  const hasIngredients =
    typeof line.ingredients_text === 'string' && line.ingredients_text.trim().length > 0;
  const hasNutriments = line.nutriments != null && Object.keys(line.nutriments).length > 0;
  if (!hasIngredients && !hasNutriments) return null;

  const raw: RawProduct = {
    product_name: line.product_name,
    brands: line.brands,
    image_url: line.image_url,
    image_front_url: line.image_front_url,
    ingredients_text: line.ingredients_text,
    nutriments: line.nutriments,
    additives_tags: line.additives_tags,
    labels_tags: line.labels_tags,
    categories: line.categories,
    quantity: line.quantity,
    serving_size: line.serving_size,
  };

  return { barcode, raw };
}
