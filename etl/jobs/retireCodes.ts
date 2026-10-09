// Uso (simulación por defecto, no escribe nada):
//   npm run etl:retire-codes -- historial --ids <id,id> --out-dir dir
//   npm run etl:retire-codes -- restringidos --input export.jsonl --out-dir dir
// `historial`: borra las filas de scan_history / saved_products / product_reports que apuntan a esos
// productos (para poder resolver un duplicado). `restringidos`: borra los productos con código de
// circulación restringida (GS1: prefijos 02 y 20 a 29) y antes sus referencias. Cada fila borrada
// queda completa en el plan. Aplicar lo revisado: ... --plan dir/<modo>-plan.json --apply
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { admin } from '../lib/supabaseAdmin';
import { isRestrictedCirculationCode } from '../lib/barcodeRepair';
import { readJsonl, sha256OfFile } from '../lib/productsExport';

const REF_TABLES = ['scan_history', 'saved_products', 'product_reports'] as const;
type Row = Record<string, unknown> & { id: string };
type Plan = {
  modo: 'historial' | 'restringidos';
  generado: string;
  origen: { archivo: string; sha256: string } | null;
  productos: { id: string; barcode: string | null; fila: Row | null }[];
  lista: { id: string; barcode: string | null; nombre: unknown; fuente: unknown; ingredientes: boolean; nutricion: boolean; motivo: string }[];
  referencias: Record<string, Row[]>;
};

const argValue = (name: string) => {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

async function referencesOf(ids: string[]): Promise<Record<string, Row[]>> {
  const out: Record<string, Row[]> = {};
  for (const table of REF_TABLES) {
    out[table] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await admin().from(table).select('*').in('product_id', ids.slice(i, i + 100));
      if (error) throw new Error(`no pude leer ${table}: ${error.message}`);
      out[table].push(...(data as Row[]));
    }
  }
  return out;
}

async function buildPlan(modo: Plan['modo']): Promise<Plan> {
  if (modo === 'historial') {
    const ids = (argValue('--ids') ?? '').split(',').filter(Boolean);
    if (ids.length === 0) throw new Error('historial exige --ids');
    return { modo, generado: new Date().toISOString(), origen: null, productos: ids.map((id) => ({ id, barcode: null, fila: null })), referencias: await referencesOf(ids), lista: [] };
  }
  const input = argValue('--input');
  if (!input) throw new Error('restringidos exige --input <export.jsonl>');
  const all: Row[] = [];
  const pendientes: Plan['lista'] = [];
  for await (const r of readJsonl(input)) {
    const code = r.barcode as string | null;
    if (isRestrictedCirculationCode(code)) all.push(r as Row);
    else if (code && /^\d{12,13}$/.test(code) && code.padStart(13, '0').startsWith('02')) {
      pendientes.push({ id: r.id as string, barcode: code, nombre: r.product_name, fuente: r.data_source, ingredientes: Boolean(r.ingredients_text), nutricion: Boolean(r.nutriments && Object.keys(r.nutriments as object).length), motivo: 'prefijo 02: pendiente de revisión, no se borra' });
    }
  }
  const dist: Record<string, number> = {};
  for (const r of all) { const key = `${String(r.barcode).slice(0, 2)} / ${r.data_source}`; dist[key] = (dist[key] ?? 0) + 1; }
  console.log(`[retire-codes] ${all.length} filas con prefijo 20 a 29; prefijo / fuente:`, JSON.stringify(dist), `· ${pendientes.length} de prefijo 02 a la lista`);
  // Los guardados del usuario no se tocan: una fila guardada va a la lista.
  const saved = (await referencesOf(all.map((r) => r.id))).saved_products.map((r) => r.product_id as string);
  const productos: Plan['productos'] = [];
  const lista = [...pendientes];
  for (const r of all) {
    if (saved.includes(r.id)) lista.push({ id: r.id, barcode: r.barcode as string, nombre: r.product_name, fuente: r.data_source, ingredientes: Boolean(r.ingredients_text), nutricion: Boolean(r.nutriments && Object.keys(r.nutriments as object).length), motivo: 'está en saved_products: no se toca el guardado' });
    else productos.push({ id: r.id, barcode: r.barcode as string, fila: r });
  }
  const referencias = await referencesOf(productos.map((p) => p.id));
  return { modo, generado: new Date().toISOString(), origen: { archivo: input, sha256: await sha256OfFile(input) }, productos, referencias, lista };
}

async function applyPlan(plan: Plan, outDir: string): Promise<void> {
  const log = join(outDir, `${plan.modo}-resultado.jsonl`);
  const say = (o: object) => appendFile(log, `${JSON.stringify(o)}\n`);
  let refs = 0;
  let prods = 0;
  for (const table of REF_TABLES) {
    for (const row of plan.referencias[table] ?? []) {
      const { data: current } = await admin().from(table).select('*').eq('id', row.id).maybeSingle();
      if (!current) { await say({ table, id: row.id, resultado: 'ya_no_existe' }); continue; }
      if (canonical(current) !== canonical(row)) { await say({ table, id: row.id, resultado: 'omitida', motivo: 'cambió desde el plan' }); continue; }
      const { data, error } = await admin().from(table).delete().eq('id', row.id).select('id');
      if (error || !data || data.length !== 1) throw new Error(`falló el borrado en ${table} ${row.id}: ${error?.message}; referencias borradas: ${refs}, productos: ${prods}`);
      await say({ table, id: row.id, resultado: 'ok' });
      refs++;
    }
  }
  if (plan.modo === 'restringidos') {
    for (const p of plan.productos) {
      const { data: current } = await admin().from('products').select('*').eq('id', p.id).maybeSingle();
      if (!current) { await say({ producto: p.id, resultado: 'ya_no_existe' }); continue; }
      if (canonical(current) !== canonical(p.fila)) { await say({ producto: p.id, resultado: 'omitido', motivo: 'cambió desde el plan' }); continue; }
      for (const table of REF_TABLES) {
        const { data } = await admin().from(table).select('id').eq('product_id', p.id);
        if (data && data.length > 0) throw new Error(`${p.id} tiene una referencia nueva en ${table}; se frena. Borradas: ${refs} referencias, ${prods} productos`);
      }
      const { data, error } = await admin().from('products').delete().eq('id', p.id).select('id');
      if (error || !data || data.length !== 1) throw new Error(`falló el borrado de ${p.id}: ${error?.message}; borrados: ${prods}`);
      const { data: gone } = await admin().from('products').select('id').eq('id', p.id).maybeSingle();
      if (gone) throw new Error(`${p.id} sigue existiendo`);
      await say({ producto: p.id, barcode: p.barcode, resultado: 'ok' });
      prods++;
    }
  }
  for (const table of REF_TABLES) {
    for (const row of plan.referencias[table] ?? []) {
      const { data } = await admin().from(table).select('id').eq('id', row.id).maybeSingle();
      if (data) throw new Error(`la referencia ${table} ${row.id} sigue existiendo`);
    }
  }
  console.log(`[retire-codes] ${plan.modo}: ${refs} referencias y ${prods} productos borrados, relectura OK`);
}

async function main() {
  const modo = process.argv[2] as Plan['modo'];
  if (!['historial', 'restringidos'].includes(modo)) throw new Error('Primer argumento: historial | restringidos');
  const outDir = argValue('--out-dir');
  if (!outDir) throw new Error('Falta --out-dir');
  if (process.argv.includes('--apply')) {
    const planPath = argValue('--plan');
    if (!planPath) throw new Error('--apply exige --plan');
    return applyPlan(JSON.parse(await readFile(planPath, 'utf8')) as Plan, outDir);
  }
  const plan = await buildPlan(modo);
  const out = join(outDir, `${modo}-plan.json`);
  await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
  const refs = Object.fromEntries(Object.entries(plan.referencias).map(([k, v]) => [k, v.length]));
  console.log(`[retire-codes] SIMULACIÓN ${modo}: ${plan.productos.length} productos, referencias ${JSON.stringify(refs)} -> ${out}`);
  console.log('[retire-codes] no se escribió nada en la base.');
}

main().catch((err) => {
  console.error('[retire-codes] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
