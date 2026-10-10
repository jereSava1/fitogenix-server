// Uso: npm run etl:evidence -- --catalog /ruta/products.jsonl --out-dir /ruta/ola6 [--sample 500]
//        [--control etl/validacion/propuestas-finales-a.json] [--report-only | --download-control]
// Solo lectura: no toca la base ni llama a IA. Por código de barras consulta Open Food Facts (un pedido cada
// 4,5 s) y VTEX de Jumbo y Carrefour (hasta 3 en paralelo), y registra qué fuente respondió y qué fotos hay.
// Los productos de control además bajan sus fotos (con SHA-256); la muestra solo registra URLs.
// Se puede cortar y retomar: lo ya consultado queda en `evidencia.jsonl`.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import {
  buildCoverage, hasData, parseOffResponse, parseVtexResponse, selectSample,
  type CatalogRow, type CodeEvidence, type OffEvidence, type VtexEvidence,
} from '../lib/evidence';

const USER_AGENT = 'Fitogenix-ETL/1.0 (lectura de fotos de etiqueta; +https://github.com/jereSava1/fitogenix-server)';
const OFF_DELAY_MS = 4500;
const VTEX_PARALLEL = 3;
const TIMEOUT_MS = 20_000;
const VTEX_HOSTS = { jumbo: 'www.jumbo.com.ar', carrefour: 'www.carrefour.com.ar' } as const;
const OFF_FIELDS = 'image_ingredients_url,image_nutrition_url,image_front_url,ingredients_text,nutriments,serving_size,quantity,last_modified_t';

type Source = 'off' | 'jumbo' | 'carrefour';
type Line = { barcode: string; source: Source; fetchedAt: string; result: OffEvidence | VtexEvidence };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

class RateLimited extends Error {}

/** Un pedido con reintento ante 5xx o red caída. Ante 429 o 403 avisa: el que llama baja el ritmo. */
async function getJson(url: string, strikes: { n: number }): Promise<{ status: number; body: unknown }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 429 || res.status === 403) {
        strikes.n++;
        if (strikes.n >= 5) throw new RateLimited(`${res.status} repetido en ${new URL(url).host}`);
        await sleep(30_000 * strikes.n);
        continue;
      }
      if (res.status >= 500 && attempt === 0) {
        await sleep(5000);
        continue;
      }
      strikes.n = 0;
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    } catch (err) {
      if (err instanceof RateLimited) throw err;
      if (attempt === 0) await sleep(5000);
    }
  }
  return { status: 0, body: null };
}

async function fetchOff(code: string, strikes: { n: number }): Promise<OffEvidence> {
  const { status, body } = await getJson(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`, strikes);
  return parseOffResponse(status, body);
}

/** VTEX recorta el cero inicial de algunos UPC (ola 2): si el código completo no está, prueba sin ceros. */
async function fetchVtex(host: string, code: string, strikes: { n: number }): Promise<VtexEvidence> {
  const variants = [code, code.replace(/^0+/, '')].filter((v, i, a) => v && a.indexOf(v) === i);
  let last: VtexEvidence = { status: 'no_encontrado', images: [] };
  for (const v of variants) {
    const { status, body } = await getJson(`https://${host}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${v}`, strikes);
    last = parseVtexResponse(status, body);
    if (last.status !== 'no_encontrado') return last;
  }
  return last;
}

async function readCatalog(path: string): Promise<CatalogRow[]> {
  const rows: CatalogRow[] = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as CatalogRow;
    rows.push({ id: r.id, barcode: r.barcode, data_source: r.data_source, ingredients_text: r.ingredients_text, nutriments: r.nutriments });
  }
  return rows;
}

async function loadEvidence(file: string): Promise<Map<string, CodeEvidence>> {
  const map = new Map<string, CodeEvidence>();
  const text = await readFile(file, 'utf8').catch(() => '');
  for (const l of text.split('\n').filter(Boolean)) {
    const { barcode, source, result } = JSON.parse(l) as Line;
    const e = map.get(barcode) ?? { barcode };
    (e as Record<string, unknown>)[source] = result; // la última línea de cada fuente gana
    map.set(barcode, e);
  }
  return map;
}

async function gather(codes: string[], file: string, evidence: Map<string, CodeEvidence>) {
  const pending = (source: Source) => codes.filter((c) => {
    const r = evidence.get(c)?.[source];
    return !r || r.status === 'sin_respuesta';
  });
  const record = async (barcode: string, source: Source, result: OffEvidence | VtexEvidence) => {
    const e = evidence.get(barcode) ?? { barcode };
    (e as Record<string, unknown>)[source] = result;
    evidence.set(barcode, e);
    const line: Line = { barcode, source, fetchedAt: new Date().toISOString(), result };
    await appendFile(file, `${JSON.stringify(line)}\n`);
  };

  const offTrack = async () => {
    const strikes = { n: 0 };
    const todo = pending('off');
    for (const [i, code] of todo.entries()) {
      await record(code, 'off', await fetchOff(code, strikes));
      if ((i + 1) % 25 === 0) console.log(`[evidence] OFF ${i + 1}/${todo.length}`);
      await sleep(OFF_DELAY_MS * (1 + strikes.n));
    }
  };
  const vtexTrack = async () => {
    const strikes = { n: 0 };
    const jobs = (['jumbo', 'carrefour'] as const).flatMap((s) => pending(s).map((c) => [s, c] as const));
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const [source, code] = jobs[next++];
        await record(code, source, await fetchVtex(VTEX_HOSTS[source], code, strikes));
        if (next % 100 === 0) console.log(`[evidence] VTEX ${next}/${jobs.length}`);
      }
    };
    await Promise.all(Array.from({ length: VTEX_PARALLEL }, worker));
  };
  // Si una pista se corta por límite de pedidos, la otra termina y lo hecho queda guardado.
  const results = await Promise.allSettled([offTrack(), vtexTrack()]);
  const stopped = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (stopped) console.error(`[evidence] corte por límite: ${stopped.reason instanceof Error ? stopped.reason.message : stopped.reason}`);
  return !stopped;
}

type Download = { barcode: string; source: string; kind: string; url: string; file: string; sha256: string; bytes: number; fetchedAt: string };

async function downloadControl(codes: string[], evidence: Map<string, CodeEvidence>, dir: string) {
  const manifest: Download[] = [];
  for (const code of codes) {
    const e = evidence.get(code);
    const items: { source: string; kind: string; url: string }[] = [];
    if (e?.off?.ingredientsPhoto) items.push({ source: 'off', kind: 'ingredientes', url: e.off.ingredientsPhoto });
    if (e?.off?.nutritionPhoto) items.push({ source: 'off', kind: 'nutricion', url: e.off.nutritionPhoto });
    if (e?.off?.frontPhoto) items.push({ source: 'off', kind: 'frente', url: e.off.frontPhoto });
    for (const s of ['jumbo', 'carrefour'] as const) {
      for (const [i, im] of (e?.[s]?.images ?? []).entries()) items.push({ source: s, kind: im.candidate ? `imagen-${i + 1}-candidata` : `imagen-${i + 1}`, url: im.url });
    }
    for (const it of items) {
      try {
        // OFF informa la miniatura (`.400.jpg`); la foto completa es la `.full.jpg` de la misma revisión.
        const full = it.url.replace(/\.400\.(jpg|png)$/, '.full.$1');
        let res = await fetch(full, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok && full !== it.url) res = await fetch(it.url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) {
          console.error(`[evidence] ${res.status} al bajar ${it.url}`);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const ext = (res.headers.get('content-type') ?? '').includes('png') ? 'png' : 'jpg';
        const rel = `${code}/${it.source}-${it.kind}.${ext}`;
        await mkdir(join(dir, code), { recursive: true });
        await writeFile(join(dir, rel), buf);
        manifest.push({ barcode: code, ...it, url: res.url, file: rel, sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length, fetchedAt: new Date().toISOString() });
      } catch (err) {
        console.error(`[evidence] no pude bajar ${it.url}: ${err instanceof Error ? err.message : err}`);
      }
      await sleep(500);
    }
  }
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

const pct = (k: number, n: number) => (n ? `${((100 * k) / n).toFixed(1)} %` : '–');

function renderMarkdown(c: ReturnType<typeof buildCoverage>, date: string) {
  const row = (name: string, g: typeof c.total) =>
    `| ${name} | ${g.n} | ${pct(g.ing, g.n)} | ${pct(g.nut, g.n)} | ${pct(g.both, g.n)} | ${pct(g.vtexAny, g.n)} | ${pct(g.vtexMulti, g.n)} | ${pct(g.vtexCandidate, g.n)} | ${pct(g.sinFotoEtiqueta, g.n)} | ${pct(g.sinNingunaFoto, g.n)} | ${g.sinRespuesta} |`;
  const p = c.proyeccion;
  const pr = (name: string, x: { estimate: number; margin95: number }) =>
    `| ${name} | ${x.estimate.toLocaleString('es-AR')} ± ${x.margin95.toLocaleString('es-AR')} | ${pct(x.estimate, c.poblacionConDatos)} |`;
  return [
    `# Cobertura de fotos de etiqueta (${date})`,
    '',
    `Muestra de ${c.muestra} productos con datos, estratificada por fuente, sobre ${c.poblacionConDatos.toLocaleString('es-AR')} del catálogo.`,
    '',
    '| Fuente | n | Ingredientes (OFF) | Nutrición (OFF) | Ambas (OFF) | Imagen VTEX | VTEX ≥ 2 imágenes | Candidata VTEX | Sin foto de etiqueta | Sin ninguna foto | Sin respuesta |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...Object.keys(c.porFuente).sort().map((s) => row(s, c.porFuente[s])),
    row('**total**', c.total),
    row('**sin los cuatro macros**', c.sinCuatroMacros),
    '',
    '## Proyección al catálogo con datos (estimación de muestra, IC 95 % aproximado)',
    '',
    '| Con | Productos | Del total |',
    '|---|---:|---:|',
    pr('foto de ingredientes en OFF', p.fotoIngredientesOff),
    pr('foto de nutrición en OFF', p.fotoNutricionOff),
    pr('ambas en OFF', p.ambasOff),
    pr('alguna imagen en VTEX', p.imagenVtex),
    pr('imagen VTEX candidata por nombre', p.candidataVtex),
    pr('sin foto de etiqueta', p.sinFotoEtiqueta),
    '',
    '"Sin foto de etiqueta" = sin foto de ingredientes ni de nutrición en OFF y sin imagen VTEX candidata por nombre. "Sin ninguna foto" = ni siquiera frente en OFF ni imagen en VTEX.',
    'Una imagen VTEX "candidata" lo es por su nombre o texto (`nutri`, `ingred`, `tabla`, `_N02`…): no se abrió ninguna. "Sin respuesta" = ninguna fuente contestó (no es "sin foto").',
    '',
  ].join('\n');
}

async function main() {
  const catalogPath = arg('--catalog');
  const outDir = arg('--out-dir');
  if (!catalogPath || !outDir) throw new Error('Faltan --catalog y --out-dir');
  const sampleSize = Number(arg('--sample') ?? 500);
  const controlPath = arg('--control') ?? 'etl/validacion/propuestas-finales-a.json';
  await mkdir(outDir, { recursive: true });
  const evidenceFile = join(outDir, 'evidencia.jsonl');

  const catalog = await readCatalog(catalogPath);
  const sample = selectSample(catalog, sampleSize);
  await writeFile(join(outDir, 'muestra.json'), `${JSON.stringify(sample.map((r) => ({ id: r.id, barcode: r.barcode, data_source: r.data_source })), null, 1)}\n`);
  const control = (JSON.parse(await readFile(controlPath, 'utf8')) as { products: { barcodes: string[] }[] }).products.flatMap((p) => p.barcodes);

  const evidence = await loadEvidence(evidenceFile);
  let complete = true;
  if (process.argv.includes('--download-control')) {
    await downloadControl(control, evidence, join(outDir, 'control'));
    return;
  }
  if (!process.argv.includes('--report-only')) {
    complete = await gather(control, evidenceFile, evidence);
    if (complete) {
      await downloadControl(control, evidence, join(outDir, 'control'));
      complete = await gather(sample.map((r) => r.barcode), evidenceFile, evidence);
    }
  }
  await writeFile(join(outDir, 'control.json'), `${JSON.stringify(control.map((c) => evidence.get(c) ?? { barcode: c }), null, 2)}\n`);

  const population = new Map<string, number>();
  for (const r of catalog.filter(hasData)) population.set(r.data_source, (population.get(r.data_source) ?? 0) + 1);
  const coverage = buildCoverage(sample, evidence, population);
  const date = new Date().toISOString().slice(0, 10);
  const consulted = sample.filter((r) => evidence.has(r.barcode)).length;
  await writeFile(join(outDir, 'cobertura.json'), `${JSON.stringify({ fecha: date, completa: complete, consultados: consulted, ...coverage }, null, 2)}\n`);
  await writeFile(join(outDir, 'cobertura.md'), renderMarkdown(coverage, date));
  console.log(`[evidence] ${complete ? 'listo' : 'INCOMPLETO'}: ${consulted}/${sample.length} códigos de la muestra con alguna respuesta`);
  if (!complete) process.exit(2);
}

main().catch((err) => {
  console.error('[evidence] error fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
