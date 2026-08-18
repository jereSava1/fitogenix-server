import type { RawOFFProduct } from '../types/fitogenix';

// ── Open Beauty Facts (OBF) ──
// Base de datos hermana de Open Food Facts para cosméticos/higiene. Mismo
// esquema de API que OFF (v0: `{ code, status, product }`), gratis y sin key.
// Se consulta como nivel de fallback cuando OFF no encuentra el barcode.
const OBF_BASE = 'https://world.openbeautyfacts.org';

// Mismos campos que pedimos a OFF: así el objeto crudo entra sin fricción en
// mapRawToProduct (que ya aplica ftgEngine para el scoring uniforme).
const OBF_FIELDS =
  'product_name,brands,image_url,image_front_url,ingredients_text,nutriments,nova_group,additives_tags,labels_tags,categories,quantity,serving_size';

// Respuesta cruda de la API v0 de OBF. `status === 1` ⇒ producto encontrado.
// El esquema del `product` es idéntico al de OFF, por eso reusamos RawOFFProduct.
type OBFApiResponse = {
  status?: number;
  status_verbose?: string;
  product?: RawOFFProduct;
};

/**
 * Busca un producto cosmético/higiene por barcode en Open Beauty Facts.
 * Devuelve `null` si no existe (status 0), si la API no responde o si falla el
 * parseo. NUNCA lanza: el error se loguea y la cascada continúa al siguiente nivel.
 */
export async function fetchBeautyProductByBarcode(
  barcode: string,
): Promise<RawOFFProduct | null> {
  if (!/^\d{8,14}$/.test(barcode.trim())) return null;

  try {
    const url = `${OBF_BASE}/api/v0/product/${encodeURIComponent(
      barcode,
    )}.json?fields=${OBF_FIELDS}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Fitogenix-Server/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      console.error(
        `[openBeautyFactsApi] OBF respondió ${r.status} para barcode ${barcode}`,
      );
      return null;
    }
    const data = (await r.json()) as OBFApiResponse;
    if (data.status !== 1 || !data.product) return null;
    return data.product;
  } catch (err) {
    console.error(
      `[openBeautyFactsApi] Error consultando OBF para barcode ${barcode}:`,
      err,
    );
    return null;
  }
}
