// Relectura de la tabla nutricional de un producto en su fuente publicada (solo lectura).
import { adaptVtexProduct } from '../adapters/vtexAdapter';

const UA = { 'User-Agent': 'Fitogenix-ETL/0.1 (contacto: soporte@fitogenix.com)' };

const VTEX_DOMAINS: Record<string, string> = {
  jumbo: 'www.jumbo.com.ar',
  disco: 'www.disco.com.ar',
  vea: 'www.vea.com.ar',
  carrefour: 'www.carrefour.com.ar',
};

export type RereadResult =
  | { status: 'ok'; nutriments: Record<string, unknown> | null }
  | { status: 'error'; message: string }
  | { status: 'sin_fuente' };

async function rereadOff(barcode: string): Promise<RereadResult> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,nutriments`;
  const res = await fetch(url, { headers: UA });
  if (res.status === 404) return { status: 'ok', nutriments: null };
  if (!res.ok) return { status: 'error', message: `OFF HTTP ${res.status}` };
  const body = (await res.json()) as { status?: number; product?: { nutriments?: Record<string, unknown> } };
  if (body.status === 0) return { status: 'ok', nutriments: null };
  return { status: 'ok', nutriments: body.product?.nutriments ?? null };
}

async function rereadVtex(domain: string, barcode: string): Promise<RereadResult> {
  const url = `https://${domain}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${encodeURIComponent(barcode)}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok && res.status !== 404) return { status: 'error', message: `${domain} HTTP ${res.status}` };
  const list = res.ok ? ((await res.json()) as unknown) : [];
  if (!Array.isArray(list)) return { status: 'ok', nutriments: null };
  for (const product of list) {
    const match = adaptVtexProduct(product as Parameters<typeof adaptVtexProduct>[0]).find(
      (p) => p.barcode === barcode,
    );
    if (match) return { status: 'ok', nutriments: (match.raw.nutriments as Record<string, unknown>) ?? null };
  }
  return { status: 'ok', nutriments: null };
}

export async function rereadNutrition(dataSource: string | null, barcode: string): Promise<RereadResult> {
  try {
    if (dataSource === 'off') return await rereadOff(barcode);
    const domain = dataSource ? VTEX_DOMAINS[dataSource] : undefined;
    if (domain) return await rereadVtex(domain, barcode);
    return { status: 'sin_fuente' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/** Pausa mínima entre pedidos a cada fuente: OFF admite 15 lecturas por minuto. */
export const REREAD_DELAY_MS: Record<string, number> = { off: 4500 };
export const REREAD_DEFAULT_DELAY_MS = 500;

export type CodeLookup =
  | { status: 'ok'; published: string | null }
  | { status: 'error'; message: string }
  | { status: 'sin_fuente' };

/** ¿Con qué código publica la fuente el producto que se le pide por `barcode`? `null` si no lo publica. */
export async function lookupPublishedCode(dataSource: string | null, barcode: string): Promise<CodeLookup> {
  try {
    if (dataSource === 'off') {
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code`;
      const res = await fetch(url, { headers: UA });
      if (res.status === 404) return { status: 'ok', published: null };
      if (!res.ok) return { status: 'error', message: `OFF HTTP ${res.status}` };
      const body = (await res.json()) as { status?: number; code?: string; product?: { code?: string } };
      return { status: 'ok', published: body.status === 0 ? null : (body.product?.code ?? body.code ?? null) };
    }
    const domain = dataSource ? VTEX_DOMAINS[dataSource] : undefined;
    if (!domain) return { status: 'sin_fuente' };
    const url = `https://${domain}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${encodeURIComponent(barcode)}`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok && res.status !== 404) return { status: 'error', message: `${domain} HTTP ${res.status}` };
    const list = res.ok ? ((await res.json()) as unknown) : [];
    if (!Array.isArray(list)) return { status: 'ok', published: null };
    for (const product of list as { items?: { ean?: string }[] }[]) {
      const ean = product.items?.map((i) => i.ean?.trim()).find((e) => e === barcode);
      if (ean) return { status: 'ok', published: ean };
    }
    return { status: 'ok', published: null };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
