// Uso (solo lectura; no escribe nada en la base):
//   npm run etl:fidelity -- --input products.jsonl --staging staging.jsonl --purge-dir dir --out-dir dir
// Compara el `nutriments` de cada producto con los bloques crudos que hay en `products_staging`
// (copias en archivo, de `etl:export-products`). Deja `fidelidad-filas.jsonl`, `fidelidad-resumen.json`
// y `ola4-plan.json` (simulación de la clase B; no hay --apply). Con `--live ola4-plan.json` relee
// una muestra reproducible de B contra la fuente publicada y deja `ola4-muestra-en-vivo.json`.
import 'dotenv/config'; // las funciones de lectura comparten módulos que cargan la config
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { normalizeBarcode } from '../lib/barcode';
import { hasNutrientData } from '../lib/completeness';
import { reproducibleSample } from '../lib/barcodeRepair';
import { classifyFidelity, diffCause, hasFourMacros, nutrientValues, type Block, type SourceBlock } from '../lib/fidelity';
import { mergeRawProducts } from '../lib/merge';
import { readJsonl, sha256OfFile } from '../lib/productsExport';
import { hasImpossibleNutrition } from '../lib/purgePlan';
import { REREAD_DELAY_MS, REREAD_DEFAULT_DELAY_MS, rereadNutrition } from '../lib/sourceReread';

type Product = {
  id: string; barcode: string | null; product_name: string | null; data_source: string | null;
  ingredients_text: string | null; nutriments: Record<string, unknown> | null;
};
type StagingEntry = { id: string; source: string; barcode: string | null; status: string; nutriments: Block };
type PlanEntry = {
  id: string; barcode: string | null; barcodeFuente: string | null; fuente: string;
  before: { nutriments: Block }; after: { nutriments: Block };
  cuatroMacros: boolean; pasaControles: boolean; enPlanDePurga?: string[];
};

const SAMPLE_SIZE = 150;
const argValue = (name: string) => {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
};

async function purgeIds(dir: string): Promise<Map<string, string[]>> {
  const marks = new Map<string, string[]>();
  const mark = (id: string, why: string) => marks.set(id, [...(marks.get(id) ?? []), why]);
  const load = async (file: string) => JSON.parse(await readFile(join(dir, file), 'utf8'));
  for (const f of ['doritos-plan.json', 'doritos-sal-plan.json']) for (const c of (await load(f)).cambios) mark(c.id, 'doritos');
  for (const c of (await load('ola1-plan.json')).cambios) mark(c.id, 'ola1');
  for (const c of (await load('ola3-plan.json')).cambios) mark(c.id, 'ola3');
  for (const c of (await load('duplicados-plan.json')).cambios) { mark(c.keeperId, 'duplicados'); mark(c.borrar.id, 'duplicados'); }
  return marks;
}

async function analyze(input: string, stagingPath: string, purgeDir: string, outDir: string): Promise<void> {
  const products: Product[] = [];
  for await (const r of readJsonl(input)) products.push(r as unknown as Product);
  const byBarcode = new Map<string, StagingEntry[]>();
  const byProduct = new Map<string, StagingEntry[]>();
  let stagingRows = 0;
  for await (const r of readJsonl(stagingPath)) {
    stagingRows++;
    const payload = (r.raw_payload ?? {}) as { nutriments?: Block };
    const entry: StagingEntry = {
      id: r.id as string, source: r.source as string, barcode: (r.barcode as string) ?? null,
      status: r.merge_status as string, nutriments: payload.nutriments ?? null,
    };
    const add = (map: Map<string, StagingEntry[]>, key: string | null) => { if (key) map.set(key, [...(map.get(key) ?? []), entry]); };
    add(byBarcode, entry.barcode ? (normalizeBarcode(entry.barcode) ?? entry.barcode) : null);
    add(byProduct, (r.merged_into as string) ?? null);
  }
  const purge = await purgeIds(purgeDir);

  const rowsOut = createWriteStream(join(outDir, 'fidelidad-filas.jsonl'), { flags: 'wx' });
  const count: Record<string, number> = {};
  const bump = (k: string) => { count[k] = (count[k] ?? 0) + 1; };
  const causas = new Map<string, { n: number; ejemplos: object[] }>();
  const planB: PlanEntry[] = [];
  const medicion = { filas: products.length, conTablaReal: 0, conCuatroMacros: 0, conIngredientesYCuatroMacros: 0 };
  const proyeccion = { conTablaReal: 0, conCuatroMacros: 0, conIngredientesYCuatroMacros: 0 };

  for (const p of products) {
    const entries = new Map<string, StagingEntry>();
    for (const e of [...(byProduct.get(p.id) ?? []), ...(p.barcode ? (byBarcode.get(p.barcode) ?? []) : [])]) entries.set(e.id, e);
    const sources: SourceBlock[] = [...entries.values()].map((e) => ({ source: e.source, nutriments: e.nutriments }));
    const verdict = classifyFidelity(p.nutriments, sources);
    const key = verdict.clase === 'A' ? `A_${verdict.sub}` : verdict.clase;
    bump(key);
    if (verdict.clase === 'C') {
      bump(`C_${verdict.causa}`);
      const entry = causas.get(verdict.causa) ?? { n: 0, ejemplos: [] };
      entry.n++;
      if (entry.ejemplos.length < 3) entry.ejemplos.push({ barcode: p.barcode, nombre: p.product_name, fuente: verdict.fuente, guardado: Object.fromEntries(nutrientValues(p.nutriments)), fuente_valores: Object.fromEntries(nutrientValues(sources.find((s) => s.source === verdict.fuente)?.nutriments)) });
      causas.set(verdict.causa, entry);
    }
    if (!rowsOut.write(`${JSON.stringify({ id: p.id, barcode: p.barcode, ...verdict, fuentes: [...new Set(sources.map((s) => s.source))] })}\n`)) await once(rowsOut, 'drain');

    const hasTable = hasNutrientData(p.nutriments);
    const hasIng = Boolean(p.ingredients_text?.trim());
    if (hasTable) medicion.conTablaReal++;
    if (hasFourMacros(p.nutriments)) { medicion.conCuatroMacros++; if (hasIng) medicion.conIngredientesYCuatroMacros++; }

    let finalBlock: Block = p.nutriments;
    if (verdict.clase === 'B') {
      // Lo que elegiría el merge ya corregido (T-06): un bloque entero, de una sola fuente.
      const merged = mergeRawProducts([...entries.values()].map((e) => ({ source: e.source, raw: { nutriments: e.nutriments ?? undefined } })), p.barcode ?? undefined);
      const origin = [...entries.values()].filter((e) => e.nutriments && JSON.stringify(e.nutriments) === JSON.stringify(merged.nutriments))[0];
      const after = merged.nutriments ?? null;
      const entry: PlanEntry = {
        id: p.id, barcode: p.barcode, barcodeFuente: origin?.barcode ?? null, fuente: origin?.source ?? '?',
        before: { nutriments: p.nutriments }, after: { nutriments: after },
        cuatroMacros: hasFourMacros(after), pasaControles: after != null && hasNutrientData(after) && !hasImpossibleNutrition(after),
      };
      const why = purge.get(p.id);
      if (why) entry.enPlanDePurga = [...new Set(why)];
      planB.push(entry);
      if (entry.pasaControles && !why) finalBlock = after;
    }
    if (hasNutrientData(finalBlock)) proyeccion.conTablaReal++;
    if (hasFourMacros(finalBlock)) { proyeccion.conCuatroMacros++; if (hasIng) proyeccion.conIngredientesYCuatroMacros++; }
  }
  rowsOut.end();
  await once(rowsOut, 'finish');

  const cambios = planB.filter((e) => e.pasaControles && !e.enPlanDePurga);
  const bySource = (list: PlanEntry[]) => list.reduce<Record<string, number>>((m, e) => ({ ...m, [e.fuente]: (m[e.fuente] ?? 0) + 1 }), {});
  const resumen = {
    generado: new Date().toISOString(),
    origen: { products: { archivo: input, sha256: await sha256OfFile(input) }, staging: { archivo: stagingPath, filas: stagingRows, sha256: await sha256OfFile(stagingPath) } },
    clases: count,
    causasC: Object.fromEntries([...causas.entries()].map(([k, v]) => [k, v])),
    simulacionB: {
      filasB: planB.length,
      pasanControles: planB.filter((e) => e.pasaControles).length,
      noPasanControles: planB.filter((e) => !e.pasaControles).length,
      ganarianCuatroMacros: cambios.filter((e) => e.cuatroMacros).length,
      enPlanDePurga: planB.filter((e) => e.enPlanDePurga).length,
      enPlanDePurgaPorPlan: planB.filter((e) => e.enPlanDePurga).reduce<Record<string, number>>((m, e) => { for (const w of e.enPlanDePurga ?? []) m[w] = (m[w] ?? 0) + 1; return m; }, {}),
      cambiosPropuestos: cambios.length,
      cambiosPorFuente: bySource(cambios),
    },
    medicionActual: medicion,
    medicionSiSeAplicaB: proyeccion,
  };
  await writeFile(join(outDir, 'fidelidad-resumen.json'), `${JSON.stringify(resumen, null, 2)}\n`, { flag: 'wx' });
  await writeFile(join(outDir, 'ola4-plan.json'), `${JSON.stringify({ generado: resumen.generado, nota: 'Simulación: no se aplica.', cambios, rechazadasPorControles: planB.filter((e) => !e.pasaControles && !e.enPlanDePurga), excluidasPorPurga: planB.filter((e) => e.enPlanDePurga) }, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ clases: count, simulacionB: resumen.simulacionB, medicionActual: medicion, medicionSiSeAplicaB: proyeccion }, null, 1));
}

function sameNutrients(a: Block, b: Block): boolean {
  const x = nutrientValues(a);
  const y = nutrientValues(b);
  return x.size > 0 && x.size === y.size && [...x].every(([k, v]) => y.get(k) === v);
}

async function live(planPath: string, outDir: string): Promise<void> {
  const plan = JSON.parse(await readFile(planPath, 'utf8')) as { cambios: PlanEntry[] };
  // Se muestrean los cambios propuestos (B que pasa los controles y no está en un plan de purga).
  const all = plan.cambios;
  const sample = reproducibleSample(all, SAMPLE_SIZE);
  const out: object[] = [];
  const tally: Record<string, number> = {};
  for (const e of sample) {
    const code = e.barcodeFuente ?? e.barcode;
    let veredicto: string;
    if (!code || e.fuente === '?') veredicto = 'error';
    else {
      const r = await rereadNutrition(e.fuente, code);
      await new Promise((res) => setTimeout(res, REREAD_DELAY_MS[e.fuente] ?? REREAD_DEFAULT_DELAY_MS));
      if (r.status !== 'ok') veredicto = 'error';
      else if (!hasNutrientData(r.nutriments)) veredicto = 'sin_tabla_en_vivo';
      else veredicto = sameNutrients(r.nutriments, e.after.nutriments) ? 'confirma' : 'contradice';
    }
    tally[veredicto] = (tally[veredicto] ?? 0) + 1;
    out.push({ id: e.id, barcode: e.barcode, fuente: e.fuente, pasaControles: e.pasaControles, enPlanDePurga: e.enPlanDePurga ?? null, veredicto });
  }
  await writeFile(join(outDir, 'ola4-muestra-en-vivo.json'), `${JSON.stringify({ generado: new Date().toISOString(), filasB: all.length, muestra: sample.length, resultado: tally, detalle: out }, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ muestra: sample.length, resultado: tally }));
}

/** Relee todos los cambios propuestos. Se aplican los que la fuente confirma o de los que solo difiere
 *  por redondeo; el resto queda en lista. Deja `ola4-aplicar.json`, para `etl:purge ola4 --apply`. */
async function liveAll(planPath: string, outDir: string): Promise<void> {
  const plan = JSON.parse(await readFile(planPath, 'utf8')) as { cambios: PlanEntry[] };
  const cambios: object[] = [];
  const omitidas: { id: string; barcode: string | null; motivo: string }[] = [];
  const tally: Record<string, number> = {};
  for (const e of plan.cambios) {
    const code = e.barcodeFuente ?? e.barcode;
    let veredicto = 'error';
    let detalle = '';
    if (code && e.fuente !== '?') {
      const r = await rereadNutrition(e.fuente, code);
      await new Promise((res) => setTimeout(res, REREAD_DELAY_MS[e.fuente] ?? REREAD_DEFAULT_DELAY_MS));
      if (r.status !== 'ok') detalle = r.status === 'error' ? r.message : r.status;
      else if (!hasNutrientData(r.nutriments)) veredicto = 'sin_tabla_en_vivo';
      else if (sameNutrients(r.nutriments, e.after.nutriments)) veredicto = 'confirma';
      else {
        const cause = diffCause(e.after.nutriments, r.nutriments);
        veredicto = cause === 'redondeo' ? 'solo_redondeo' : `difiere_${cause}`;
      }
    }
    tally[veredicto] = (tally[veredicto] ?? 0) + 1;
    if (veredicto === 'confirma' || veredicto === 'solo_redondeo') {
      cambios.push({ id: e.id, barcode: e.barcode, reason: `tabla perdida (ola 4); la fuente (${e.fuente}) ${veredicto === 'confirma' ? 'confirma' : 'coincide salvo redondeo con'} el bloque de staging`, before: e.before, after: e.after });
    } else omitidas.push({ id: e.id, barcode: e.barcode, motivo: `${veredicto}${detalle ? `: ${detalle}` : ''}` });
  }
  await writeFile(join(outDir, 'ola4-aplicar.json'), `${JSON.stringify({ ola: 'ola4', generado: new Date().toISOString(), origen: null, cambios, omitidas }, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ relecturas: plan.cambios.length, resultado: tally, seAplican: cambios.length, enLista: omitidas.length }));
}

async function main() {
  const outDir = argValue('--out-dir');
  if (!outDir) throw new Error('Falta --out-dir');
  const liveAllPlan = argValue('--live-all');
  if (liveAllPlan) return liveAll(liveAllPlan, outDir);
  const livePlan = argValue('--live');
  if (livePlan) return live(livePlan, outDir);
  const input = argValue('--input');
  const staging = argValue('--staging');
  const purgeDir = argValue('--purge-dir');
  if (!input || !staging || !purgeDir) throw new Error('Faltan --input, --staging y --purge-dir');
  return analyze(input, staging, purgeDir, outDir);
}

main().catch((err) => {
  console.error('[fidelity] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
