import { config } from '../config';
import type { RawOFFProduct } from '../types/fitogenix';

// ── Edamam Food Database API ──
// Fallback pago (freemium) para datos de producto por UPC, más simple que
// FatSecret: autentica por query param (`app_id` + `app_key`), sin OAuth.
// Es el nivel 3 de la cascada de lookup, después de OFF y OBF. Si faltan las
// keys en config, se saltea el nivel (loguea y devuelve null; no crashea).
const EDAMAM_PARSER = 'https://api.edamam.com/api/food-database/v2/parser';

// ── Esquema CRUDO de la respuesta de Edamam (parser) ──
// Solo tipamos lo que consumimos. Los nutrientes vienen por 100 g bajo códigos
// propios de Edamam (ENERC_KCAL, PROCNT, ...) que el adapter traduce al shape
// `<clave>_100g` que espera ftgEngine.
type EdamamNutrients = {
  ENERC_KCAL?: number; // energía (kcal)
  PROCNT?: number; // proteínas (g)
  FAT?: number; // grasas totales (g)
  FASAT?: number; // grasas saturadas (g)
  FATRN?: number; // grasas trans (g)
  CHOCDF?: number; // carbohidratos (g)
  SUGAR?: number; // azúcares (g)
  FIBTG?: number; // fibra (g)
  NA?: number; // sodio (mg)
  CHOLE?: number; // colesterol (mg)
};

type EdamamFood = {
  foodId?: string;
  label?: string;
  brand?: string;
  category?: string;
  image?: string;
  nutrients?: EdamamNutrients;
};

type EdamamHint = { food?: EdamamFood };

type EdamamParserResponse = {
  hints?: EdamamHint[];
  // Algunas respuestas devuelven el match directo bajo `parsed` en vez de hints.
  parsed?: EdamamHint[];
};

// ── Adapter: nutrientes de Edamam (por 100 g) → nutriments estilo OFF ──
// ftgEngine lee `<clave>_100g` (ver computeNutritionScore / extractNutrition).
// Edamam ya expone los valores por 100 g, así que el mapeo es directo salvo por
// el sodio y el colesterol: ftgEngine espera esos dos en gramos y multiplica
// x1000 internamente, mientras que Edamam los da en mg → dividimos por 1000.
function toOFFNutriments(n: EdamamNutrients): Record<string, number> {
  const out: Record<string, number> = {};
  const set = (key: string, value: number | undefined): void => {
    if (typeof value === 'number' && !Number.isNaN(value)) out[key] = value;
  };

  set('energy-kcal_100g', n.ENERC_KCAL);
  set('proteins_100g', n.PROCNT);
  set('fat_100g', n.FAT);
  set('saturated-fat_100g', n.FASAT);
  set('trans-fat_100g', n.FATRN);
  set('carbohydrates_100g', n.CHOCDF);
  set('sugars_100g', n.SUGAR);
  set('fiber_100g', n.FIBTG);
  // Edamam entrega sodio/colesterol en mg; ftgEngine los quiere en g.
  set('sodium_100g', n.NA != null ? n.NA / 1000 : undefined);
  set('cholesterol_100g', n.CHOLE != null ? n.CHOLE / 1000 : undefined);

  return out;
}

// ── Adapter: food de Edamam → RawOFFProduct ──
// Reusamos RawOFFProduct como contrato común para que mapRawToProduct + ftgEngine
// scoreen igual sin importar la fuente.
function toRawOFFProduct(food: EdamamFood): RawOFFProduct {
  return {
    product_name: food.label,
    brands: food.brand,
    image_url: food.image,
    image_front_url: food.image,
    categories: food.category,
    nutriments: toOFFNutriments(food.nutrients ?? {}),
    // Edamam no expone ingredientes ni NOVA por UPC; se dejan sin definir.
  };
}

/**
 * Busca un producto por UPC/barcode en Edamam Food Database.
 * Devuelve `null` si faltan las keys, si no hay match, si la API falla o si el
 * parseo falla. NUNCA lanza: el error se loguea y la cascada sigue al siguiente
 * nivel (Claude).
 */
export async function fetchEdamamByBarcode(
  barcode: string,
): Promise<RawOFFProduct | null> {
  if (!/^\d{8,14}$/.test(barcode.trim())) return null;

  const appId = config.edamamAppId;
  const appKey = config.edamamAppKey;
  if (!appId || !appKey) {
    console.error(
      '[fallbackFoodApi] Faltan EDAMAM_APP_ID/EDAMAM_APP_KEY; se saltea el nivel Edamam.',
    );
    return null;
  }

  try {
    const url = `${EDAMAM_PARSER}?${new URLSearchParams({
      upc: barcode,
      app_id: appId,
      app_key: appKey,
    })}`;
    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      console.error(
        `[fallbackFoodApi] Edamam respondió ${r.status} para barcode ${barcode}`,
      );
      return null;
    }
    const data = (await r.json()) as EdamamParserResponse;
    const food =
      data.parsed?.[0]?.food ?? data.hints?.[0]?.food ?? null;
    if (!food || !food.label) return null;
    return toRawOFFProduct(food);
  } catch (err) {
    console.error(
      `[fallbackFoodApi] Error consultando Edamam para barcode ${barcode}:`,
      err,
    );
    return null;
  }
}
