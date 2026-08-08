import type { RawOFFProduct } from '../../../src/types/fitogenix';
import { normalizeBarcode } from '../lib/barcode';

// Países soportados y su tag de OFF — Fase 1 de 06-agente-etl-data.md. Mapa
// completo disponible para cuando se expanda a más LATAM, pero el DEFAULT
// activo es SOLO Argentina (ver DEFAULT_COUNTRY_TAGS abajo): Fitogenix hoy
// solo escanea productos argentinos, así que no tiene sentido gastar tiempo
// de merge/enrichment en productos de Chile/México/etc. que nunca se van a
// escanear. `npm run etl:off -- --countries chile,uruguay` los habilita
// explícitamente cuando haga falta, sin tocar código.
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

// `countries_tags` lo llena la comunidad de OFF a mano — mucho producto real
// (incluso de marcas grandes) no lo tiene tageado o lo tiene mal. El prefijo
// GS1 779 identifica códigos de barra REGISTRADOS en Argentina — asignado por
// rango de numeración, no depende de que nadie haya tageado nada. Un barcode
// scrapeado de un retailer argentino que empieza con 779 es, por definición,
// un producto argentino, tenga o no countries_tags en OFF. Esto sube el rate
// de match del merge por barcode (Fase 3b) sin gastar un token de IA. Solo
// aplica si Argentina está entre los países activos — si alguien pide
// SOLO `--countries chile`, un barcode 779 no debería colarse igual.
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
  nova_group?: number;
  additives_tags?: string[];
  labels_tags?: string[];
  categories?: string;
  quantity?: string;
  serving_size?: string;
  countries_tags?: string[];
};

export type AdaptedProduct = { barcode: string; raw: RawOFFProduct };

/**
 * Adapta una línea cruda del dump de OFF a RawOFFProduct. Devuelve null si no
 * aplica: sin barcode válido, fuera de los países activos (`countryTags` —
 * Argentina por default, ver DEFAULT_COUNTRY_TAGS), o sin ningún dato
 * aprovechable — mismo criterio que el gate de completitud de la Fase 3,
 * aplicado acá temprano para no cargar `products_staging` con filas que se
 * van a descartar sí o sí (o que van a matchear un producto que nunca se va
 * a escanear en Argentina).
 */
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

  const raw: RawOFFProduct = {
    product_name: line.product_name,
    brands: line.brands,
    image_url: line.image_url,
    image_front_url: line.image_front_url,
    ingredients_text: line.ingredients_text,
    nutriments: line.nutriments,
    nova_group: line.nova_group,
    additives_tags: line.additives_tags,
    labels_tags: line.labels_tags,
    categories: line.categories,
    quantity: line.quantity,
    serving_size: line.serving_size,
  };

  return { barcode, raw };
}
