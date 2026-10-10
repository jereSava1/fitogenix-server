// Medición de fotos de etiqueta publicadas (ola 6, etapa A). Funciones puras: sin red ni disco.
import { hasNutrientData } from './completeness';

export type CatalogRow = {
  id: string;
  barcode: string;
  data_source: string;
  ingredients_text?: string | null;
  nutriments?: Record<string, unknown> | null;
};

const MACROS = ['energy-kcal', 'proteins', 'carbohydrates', 'fat'] as const;

function isNum(v: unknown): boolean {
  return typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));
}

export function hasFourMacros(n: Record<string, unknown> | null | undefined): boolean {
  return !!n && MACROS.every((k) => isNum(n[`${k}_100g`] ?? n[k]));
}

export function hasData(r: CatalogRow): boolean {
  return (typeof r.ingredients_text === 'string' && r.ingredients_text.trim() !== '') || hasNutrientData(r.nutriments);
}

/** Muestra estratificada y reproducible: solo filas con datos; cupo por `data_source` en proporción a su
 *  peso (restos mayores, desempate por nombre); en cada estrato, filas ordenadas por `id` y una de cada
 *  `tamaño / cupo` (la del medio de cada tramo). Mismo catálogo y mismo n, misma muestra. */
export function selectSample(rows: CatalogRow[], n: number): CatalogRow[] {
  const strata = new Map<string, CatalogRow[]>();
  for (const r of rows.filter(hasData)) {
    const list = strata.get(r.data_source) ?? [];
    list.push(r);
    strata.set(r.data_source, list);
  }
  const total = [...strata.values()].reduce((a, l) => a + l.length, 0);
  const names = [...strata.keys()].sort();
  const quota = new Map<string, number>();
  const rest: { name: string; frac: number }[] = [];
  for (const name of names) {
    const exact = (n * strata.get(name)!.length) / total;
    quota.set(name, Math.floor(exact));
    rest.push({ name, frac: exact - Math.floor(exact) });
  }
  rest.sort((a, b) => b.frac - a.frac || a.name.localeCompare(b.name));
  let missing = n - [...quota.values()].reduce((a, b) => a + b, 0);
  for (const { name } of rest) {
    if (missing-- <= 0) break;
    quota.set(name, quota.get(name)! + 1);
  }
  const out: CatalogRow[] = [];
  for (const name of names) {
    const list = strata.get(name)!.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const q = quota.get(name)!;
    for (let i = 0; i < q; i++) out.push(list[Math.floor(((i + 0.5) * list.length) / q)]);
  }
  return out;
}

export type Status = 'ok' | 'no_encontrado' | 'sin_respuesta';

export type OffEvidence = {
  status: Status;
  ingredientsPhoto?: string;
  nutritionPhoto?: string;
  frontPhoto?: string;
  hasIngredientsText?: boolean;
  hasNutriments?: boolean;
  servingSize?: string;
  quantity?: string;
  lastModified?: number;
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

/** Respuesta de `GET /api/v2/product/<code>`. `status: 0` o 404 = OFF no lo tiene; otro error = sin respuesta. */
export function parseOffResponse(httpStatus: number, body: unknown): OffEvidence {
  if (httpStatus === 404) return { status: 'no_encontrado' };
  if (httpStatus < 200 || httpStatus >= 300 || typeof body !== 'object' || body === null) return { status: 'sin_respuesta' };
  const b = body as { status?: number; product?: Record<string, unknown> };
  if (b.status === 0 || !b.product) return { status: 'no_encontrado' };
  const p = b.product;
  return {
    status: 'ok',
    ingredientsPhoto: str(p.image_ingredients_url),
    nutritionPhoto: str(p.image_nutrition_url),
    frontPhoto: str(p.image_front_url),
    hasIngredientsText: !!str(p.ingredients_text),
    hasNutriments: hasNutrientData(p.nutriments as Record<string, unknown> | undefined),
    servingSize: str(p.serving_size),
    quantity: str(p.quantity),
    lastModified: typeof p.last_modified_t === 'number' ? p.last_modified_t : undefined,
  };
}

export type VtexImage = { url: string; label?: string; text?: string; candidate: boolean };
export type VtexEvidence = { status: Status; productName?: string; images: VtexImage[] };

// Pista por nombre, sin abrir la imagen: "nutri", "ingred", "tabla", "etiqueta" o el sufijo `_N02` que
// usa Carrefour. Es una sospecha, no una clasificación.
const CANDIDATE = /nutri|ingred|tabla|etiqueta|r[oó]tulo|_n0[2-9]\b/i;

export function isCandidateImage(url: string, label?: string, text?: string): boolean {
  const file = url.split('?')[0].split('/').pop() ?? '';
  return CANDIDATE.test(`${file} ${label ?? ''} ${text ?? ''}`);
}

/** Respuesta de `products/search?fq=alternateIds_Ean:<EAN>`: lista vacía = la tienda no lo tiene. */
export function parseVtexResponse(httpStatus: number, body: unknown): VtexEvidence {
  if (httpStatus < 200 || httpStatus >= 300 || !Array.isArray(body)) return { status: 'sin_respuesta', images: [] };
  const product = body[0] as
    | { productName?: string; items?: { images?: { imageUrl?: string; imageLabel?: string; imageText?: string }[] }[] }
    | undefined;
  if (!product) return { status: 'no_encontrado', images: [] };
  const seen = new Set<string>();
  const images: VtexImage[] = [];
  for (const item of product.items ?? []) {
    for (const im of item.images ?? []) {
      const url = str(im.imageUrl);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const label = str(im.imageLabel);
      const text = str(im.imageText);
      images.push({ url, label, text, candidate: isCandidateImage(url, label, text) });
    }
  }
  return { status: 'ok', productName: product.productName, images };
}

export type CodeEvidence = { barcode: string; off?: OffEvidence; jumbo?: VtexEvidence; carrefour?: VtexEvidence };

export function flags(e: CodeEvidence | undefined) {
  const off = e?.off;
  const imgs = [e?.jumbo, e?.carrefour].filter((v) => v?.status === 'ok').flatMap((v) => v!.images);
  const ing = !!off?.ingredientsPhoto;
  const nut = !!off?.nutritionPhoto;
  const vtexCandidate = imgs.some((i) => i.candidate);
  return {
    ing,
    nut,
    both: ing && nut,
    vtexAny: imgs.length > 0,
    vtexCandidate,
    vtexImages: imgs.length,
    sinFotoEtiqueta: !ing && !nut && !vtexCandidate,
    sinNingunaFoto: !ing && !nut && !off?.frontPhoto && imgs.length === 0,
    sinRespuesta: !e || [e.off, e.jumbo, e.carrefour].every((s) => !s || s.status === 'sin_respuesta'),
  };
}

export type Group = {
  n: number;
  ing: number;
  nut: number;
  both: number;
  vtexAny: number;
  vtexCandidate: number;
  vtexMulti: number;
  sinFotoEtiqueta: number;
  sinNingunaFoto: number;
  sinRespuesta: number;
};
const empty = (): Group => ({
  n: 0, ing: 0, nut: 0, both: 0, vtexAny: 0, vtexCandidate: 0, vtexMulti: 0, sinFotoEtiqueta: 0, sinNingunaFoto: 0, sinRespuesta: 0,
});

function add(g: Group, f: ReturnType<typeof flags>) {
  g.n++;
  if (f.ing) g.ing++;
  if (f.nut) g.nut++;
  if (f.both) g.both++;
  if (f.vtexAny) g.vtexAny++;
  if (f.vtexCandidate) g.vtexCandidate++;
  if (f.vtexImages >= 2) g.vtexMulti++;
  if (f.sinFotoEtiqueta) g.sinFotoEtiqueta++;
  if (f.sinNingunaFoto) g.sinNingunaFoto++;
  if (f.sinRespuesta) g.sinRespuesta++;
}

export type Projection = { estimate: number; margin95: number };

/** Total proyectado con la fórmula estratificada. Varianza con p ajustada ((k+2)/(n+4)) para que un 0 de
 *  muestra no dé margen 0. Aproximación normal: orientativa. */
export function project(parts: { pop: number; n: number; k: number }[]): Projection {
  let estimate = 0;
  let variance = 0;
  for (const { pop, n, k } of parts) {
    if (n === 0) continue;
    estimate += (pop * k) / n;
    const p = (k + 2) / (n + 4);
    variance += pop * pop * ((p * (1 - p)) / n) * (1 - n / pop);
  }
  return { estimate: Math.round(estimate), margin95: Math.round(1.96 * Math.sqrt(variance)) };
}

export function buildCoverage(sample: CatalogRow[], evidence: Map<string, CodeEvidence>, population: Map<string, number>) {
  const porFuente: Record<string, Group> = {};
  const total = empty();
  const sinCuatroMacros = empty();
  for (const r of sample) {
    const f = flags(evidence.get(r.barcode));
    add((porFuente[r.data_source] ??= empty()), f);
    add(total, f);
    if (!hasFourMacros(r.nutriments)) add(sinCuatroMacros, f);
  }
  const sources = Object.keys(porFuente).sort();
  const proj = (pick: (g: Group) => number) =>
    project(sources.map((s) => ({ pop: population.get(s) ?? 0, n: porFuente[s].n, k: pick(porFuente[s]) })));
  return {
    muestra: total.n,
    poblacionConDatos: [...population.values()].reduce((a, b) => a + b, 0),
    poblacionPorFuente: Object.fromEntries(population),
    total,
    porFuente,
    sinCuatroMacros,
    proyeccion: {
      fotoIngredientesOff: proj((g) => g.ing),
      fotoNutricionOff: proj((g) => g.nut),
      ambasOff: proj((g) => g.both),
      imagenVtex: proj((g) => g.vtexAny),
      candidataVtex: proj((g) => g.vtexCandidate),
      sinFotoEtiqueta: proj((g) => g.sinFotoEtiqueta),
    },
  };
}
