// Uso (simulación por defecto, no escribe nada):
//   npm run etl:merge-duplicates -- --input export.jsonl --pairs ola2-plan.json --out-dir dir
// Para cada código inválido que choca con una fila que ya tiene el código completo: pasa a la fila
// que queda los campos que le faltan (ingredientes, nutrición entera, marca, imagen) y borra la
// duplicada, con su fila completa en el plan. Una duplicada referenciada por guardados, historial
// o reportes no se borra: va a la lista. Aplicar lo revisado:
//   npm run etl:merge-duplicates -- --plan dir/duplicados-plan.json --out-dir dir --apply
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { admin } from '../lib/supabaseAdmin';
import { hasNutrientData } from '../lib/completeness';
import { readJsonl, sha256OfFile } from '../lib/productsExport';
import { fieldsToPass, type DuplicateRow } from '../lib/barcodeRepair';
import { hasImpossibleNutrition } from '../lib/purgePlan';

type Row = DuplicateRow & Record<string, unknown>;
type Change = {
  keeperId: string;
  keeperBarcode: string;
  pasar: Record<string, unknown>;
  keeperAntes: Record<string, unknown>;
  borrar: { id: string; barcode: string; fila: Row };
};
type Plan = {
  generado: string;
  origen: { archivo: string; sha256: string };
  cambios: Change[];
  lista: { id: string; barcode: string | null; motivo: string }[];
};

const nutritionIsUsable = (n: Record<string, unknown> | null) => hasNutrientData(n) && !hasImpossibleNutrition(n);

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

async function userReferences(id: string): Promise<string[]> {
  const found: string[] = [];
  for (const table of ['saved_products', 'scan_history', 'product_reports']) {
    const { data, error } = await admin().from(table).select('product_id').eq('product_id', id);
    if (error) throw new Error(`no pude leer ${table}: ${error.message}`);
    if (data.length > 0) found.push(`${table} (${data.length})`);
  }
  return found;
}

async function buildPlan(input: string, pairsPath: string): Promise<Plan> {
  const rows = new Map<string, Row>();
  for await (const r of readJsonl(input)) rows.set(r.id as string, r as Row);
  const pairs = (JSON.parse(await readFile(pairsPath, 'utf8')).lista as { id: string; barcode: string; otraFila?: { id: string } }[]).filter((p) => p.otraFila);
  const cambios: Change[] = [];
  const lista: Plan['lista'] = [];

  for (const pair of pairs) {
    const dup = rows.get(pair.id);
    const keeper = pair.otraFila ? rows.get(pair.otraFila.id) : undefined;
    if (!dup || !keeper) { lista.push({ id: pair.id, barcode: pair.barcode, motivo: 'la duplicada o la que queda ya no está en la copia' }); continue; }
    const refs = await userReferences(dup.id);
    if (refs.length > 0) { lista.push({ id: dup.id, barcode: dup.barcode, motivo: `la duplicada está referenciada desde ${refs.join(', ')}; no se borra` }); continue; }
    const pasar = fieldsToPass(keeper, dup, nutritionIsUsable);
    cambios.push({
      keeperId: keeper.id,
      keeperBarcode: keeper.barcode as string,
      pasar,
      keeperAntes: Object.fromEntries(Object.keys(pasar).map((f) => [f, keeper[f] ?? null])),
      borrar: { id: dup.id, barcode: dup.barcode as string, fila: dup },
    });
  }
  return { generado: new Date().toISOString(), origen: { archivo: input, sha256: await sha256OfFile(input) }, cambios, lista };
}

async function applyPlan(plan: Plan, outDir: string): Promise<void> {
  const log = join(outDir, 'duplicados-resultado.jsonl');
  const say = (o: object) => appendFile(log, `${JSON.stringify(o)}\n`);
  let pares = 0;
  for (const c of plan.cambios) {
    const fields = Object.keys(c.pasar);
    const { data: keeper, error } = await admin().from('products').select('*').eq('id', c.keeperId).maybeSingle();
    if (error) throw new Error(`no pude leer ${c.keeperId}: ${error.message}`);
    const { data: dup } = await admin().from('products').select('*').eq('id', c.borrar.id).maybeSingle();
    const ok = keeper && dup && canonical(dup) === canonical(c.borrar.fila) &&
      fields.every((f) => canonical((keeper as Row)[f]) === canonical(c.keeperAntes[f]));
    if (!ok) { await say({ keeperId: c.keeperId, resultado: 'omitido', motivo: 'alguna de las dos filas cambió desde el plan' }); continue; }
    if ((await userReferences(c.borrar.id)).length > 0) { await say({ keeperId: c.keeperId, resultado: 'omitido', motivo: 'ahora la duplicada está referenciada' }); continue; }

    if (fields.length > 0) {
      const { data, error: e } = await admin().from('products').update(c.pasar).eq('id', c.keeperId).select('id');
      if (e || !data || data.length !== 1) throw new Error(`falló la actualización de ${c.keeperId}: ${e?.message}; pares completos: ${pares}`);
      const { data: after } = await admin().from('products').select('*').eq('id', c.keeperId).maybeSingle();
      if (!after || !fields.every((f) => canonical((after as Row)[f]) === canonical(c.pasar[f]))) throw new Error(`relectura distinta en ${c.keeperId}; pares completos: ${pares}`);
    }
    const { data: del, error: e2 } = await admin().from('products').delete().eq('id', c.borrar.id).select('id');
    if (e2 || !del || del.length !== 1) throw new Error(`falló el borrado de ${c.borrar.id}: ${e2?.message}; el campo ya se pasó a ${c.keeperId}; pares completos: ${pares}`);
    const { data: gone } = await admin().from('products').select('id').eq('id', c.borrar.id).maybeSingle();
    if (gone) throw new Error(`${c.borrar.id} sigue existiendo`);
    await say({ keeperId: c.keeperId, borrada: c.borrar.id, pasados: fields, resultado: 'ok' });
    pares++;
  }
  console.log(`[merge-duplicates] ${pares} pares resueltos (de ${plan.cambios.length} del plan)`);
}

async function main() {
  const outDir = argValue('--out-dir');
  if (!outDir) throw new Error('Falta --out-dir');
  if (process.argv.includes('--apply')) {
    const planPath = argValue('--plan');
    if (!planPath) throw new Error('--apply exige --plan <plan revisado>');
    await applyPlan(JSON.parse(await readFile(planPath, 'utf8')) as Plan, outDir);
    return;
  }
  const input = argValue('--input');
  const pairs = argValue('--pairs');
  if (!input || !pairs) throw new Error('Faltan --input <export.jsonl> y --pairs <ola2-plan.json>');
  const plan = await buildPlan(input, pairs);
  const out = join(outDir, 'duplicados-plan.json');
  await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
  console.log(`[merge-duplicates] SIMULACIÓN: ${plan.cambios.length} pares, ${plan.lista.length} a la lista -> ${out}`);
  console.log('[merge-duplicates] no se escribió nada en la base.');
}

main().catch((err) => {
  console.error('[merge-duplicates] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
