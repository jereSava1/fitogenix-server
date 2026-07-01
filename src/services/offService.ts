import type { RawOFFProduct } from '../types/fitogenix';

const OFF_BASE = 'https://world.openfoodfacts.org';
const OFF_AR = 'https://ar.openfoodfacts.org';
const SEARCH_BASE = 'https://search.openfoodfacts.org';

const OFF_FIELDS =
  'product_name,brands,image_url,image_front_url,ingredients_text,nutriments,nova_group,additives_tags,labels_tags,categories,quantity,serving_size';

const SEARCH_FIELDS = [
  'code', 'product_name', 'brands', 'image_url', 'image_front_url',
  'nutriments', 'nova_group', 'additives_tags', 'labels_tags',
  'categories', 'quantity', 'serving_size',
].join(',');

export class OffServiceUnavailableError extends Error {
  constructor() {
    super('Open Food Facts no está disponible');
    this.name = 'OffServiceUnavailableError';
  }
}

type FetchResult<T> = { ok: true; data: T } | { ok: false };

async function fetchJson<T>(
  url: string,
  timeoutMs = 5000,
): Promise<FetchResult<T>> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Fitogenix-Server/1.0' },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!r.ok) return { ok: false };
    return { ok: true, data: await r.json() as T };
  } catch {
    clearTimeout(tid);
    return { ok: false };
  }
}

type OFFApiResponse = { status?: number; product?: RawOFFProduct };

async function fetchByCode(code: string): Promise<RawOFFProduct | null> {
  const url = `${code.length > 8 ? OFF_BASE : OFF_AR}`;
  const [worldRes, arRes] = await Promise.allSettled([
    fetchJson<OFFApiResponse>(`${OFF_BASE}/api/v0/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`),
    fetchJson<OFFApiResponse>(`${OFF_AR}/api/v0/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`),
  ]);

  const w = worldRes.status === 'fulfilled' ? worldRes.value : { ok: false as const };
  const a = arRes.status === 'fulfilled' ? arRes.value : { ok: false as const };

  if (!w.ok && !a.ok) throw new OffServiceUnavailableError();

  const fromWorld = w.ok && w.data.status === 1 ? w.data.product : null;
  const fromAR = a.ok && a.data.status === 1 ? a.data.product : null;

  return (
    ([fromWorld, fromAR].filter(Boolean) as RawOFFProduct[])
      .sort((a, b) => (b.ingredients_text?.length ?? 0) - (a.ingredients_text?.length ?? 0))[0] ?? null
  );
}

async function fetchIngredientsByCode(code: string): Promise<string> {
  const [worldRes, arRes] = await Promise.allSettled([
    fetchJson<OFFApiResponse>(`${OFF_BASE}/api/v0/product/${encodeURIComponent(code)}.json?fields=ingredients_text`),
    fetchJson<OFFApiResponse>(`${OFF_AR}/api/v0/product/${encodeURIComponent(code)}.json?fields=ingredients_text`),
  ]);

  const w = worldRes.status === 'fulfilled' ? worldRes.value : { ok: false as const };
  const a = arRes.status === 'fulfilled' ? arRes.value : { ok: false as const };

  if (!w.ok && !a.ok) throw new OffServiceUnavailableError();

  const fromWorld = w.ok && w.data.status === 1 ? w.data.product?.ingredients_text : undefined;
  const fromAR = a.ok && a.data.status === 1 ? a.data.product?.ingredients_text : undefined;

  return [fromWorld, fromAR]
    .filter(Boolean)
    .sort((a, b) => (b?.length ?? 0) - (a?.length ?? 0))[0] ?? '';
}

type SearchHit = {
  code?: string;
  product_name?: string;
  brands?: string[];
} & Omit<RawOFFProduct, 'brands' | '_aiEnriched' | '_aiSource'>;

type SearchResponse = { hits?: SearchHit[] };

async function searchOnce(q: string, extra: string): Promise<SearchHit[]> {
  const res = await fetchJson<SearchResponse>(
    `${SEARCH_BASE}/search?${new URLSearchParams({
      q: extra ? `${q} ${extra}` : q,
      page_size: '5',
      fields: SEARCH_FIELDS,
    })}`,
  );
  return res.ok ? (res.data.hits ?? []) : [];
}

export type ResolvedSearchFields = Omit<RawOFFProduct, '_aiEnriched' | '_aiSource'>;

export async function resolveQueryToCode(
  query: string,
): Promise<{ code: string; fields: ResolvedSearchFields } | null> {
  const [global, argentina] = await Promise.all([
    searchOnce(query, ''),
    searchOnce(query, 'countries_tags:"en:argentina"'),
  ]);

  const candidates = [...global, ...argentina].filter(
    (h) => h.code && (h.product_name || (h.brands?.length ?? 0) > 0),
  );

  if (!candidates.length) return null;

  const words = query.toLowerCase().split(/\s+/);
  const score = (h: SearchHit) => {
    const name = `${h.product_name ?? ''} ${(h.brands ?? []).join(' ')}`.toLowerCase();
    return words.filter((w) => name.includes(w)).length;
  };
  candidates.sort((a, b) => score(b) - score(a));

  const best = candidates[0];
  if (!best.code) return null;

  const { code, ...rest } = best;
  const fields: ResolvedSearchFields = {
    ...rest,
    brands: Array.isArray(rest.brands) ? rest.brands.join(', ') : (rest.brands as string | undefined),
  };

  return { code, fields };
}

export async function fetchProductByBarcode(code: string): Promise<RawOFFProduct | null> {
  return fetchByCode(code);
}

export async function completeResolvedMatch(
  code: string,
  fields: ResolvedSearchFields,
): Promise<RawOFFProduct> {
  let ingredients_text = '';
  try {
    ingredients_text = await fetchIngredientsByCode(code);
  } catch (err) {
    if (!(err instanceof OffServiceUnavailableError)) throw err;
  }
  return { ...fields, ingredients_text };
}
