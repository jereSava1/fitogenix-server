// Uso (simulación por defecto, no escribe nada en la base):
//   npm run etl:purge -- <doritos|doritos-sal|ola1|ola1-flag|ola3|ola5-duras> --input export.jsonl --out-dir dir
// Deja `<ola>-plan.json` con las filas afectadas y los valores de antes y de después.
// Para aplicar lo revisado:
//   npm run etl:purge -- <ola> --plan dir/<ola>-plan.json --out-dir dir --apply
// Solo `products`, solo por `id` listado en el plan, nunca un update sin filtro. Antes de cada
// escritura relee la fila y exige que siga como en el plan; después la relee y la compara.
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { admin } from '../lib/supabaseAdmin';
import { readJsonl, sha256OfFile } from '../lib/productsExport';
import {
  decideNutritionBlock,
  hasImpossibleNutrition,
  planAiCleanup,
  planAiFlagOff,
  planClearIngredients,
  planNutritionBlock,
  planNutrimentValue,
  type PlannedChange,
  type PurgeRow,
} from '../lib/purgePlan';
import { REREAD_DEFAULT_DELAY_MS, REREAD_DELAY_MS, rereadNutrition } from '../lib/sourceReread';

const OLAS = ['doritos', 'doritos-sal', 'ola1', 'ola1-flag', 'ola3', 'ola5-duras'] as const;
type Ola = (typeof OLAS)[number];

type Plan = {
  ola: Ola;
  generado: string;
  origen: { archivo: string; sha256: string } | null;
  cambios: PlannedChange[];
  omitidas: { id: string; barcode: string | null; motivo: string }[];
};

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

/** Igualdad de JSON sin importar el orden de las claves (jsonb no lo conserva). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

async function loadRows(input: string): Promise<PurgeRow[]> {
  const rows: PurgeRow[] = [];
  for await (const r of readJsonl(input)) rows.push(r as unknown as PurgeRow);
  return rows;
}

async function buildPlan(ola: Ola, input: string): Promise<Plan> {
  const rows = await loadRows(input);
  const omitidas: Plan['omitidas'] = [];
  let cambios: PlannedChange[];

  if (ola === 'doritos') {
    cambios = planNutrimentValue(
      rows, '7790310983737', 'sodium_100g', 0.664, 0.672,
      'D-97: 168 mg cada 25 g = 672 mg/100 g',
    );
  } else if (ola === 'doritos-sal') {
    cambios = planNutrimentValue(
      rows, '7790310983737', 'salt_100g', 1.66, 1.68,
      'coherente con sodium_100g 0,672 (sal = sodio x 2,5)',
    );
  } else if (ola === 'ola5-duras') {
    const idsPath = argValue('--ids');
    if (!idsPath) throw new Error('ola5-duras exige --ids <json con [{id}]>');
    const ids = (JSON.parse(await readFile(idsPath, 'utf8')) as { id: string }[]).map((x) => x.id);
    cambios = planClearIngredients(rows, ids);
  } else if (ola === 'ola1-flag') {
    cambios = planAiFlagOff(rows);
  } else if (ola === 'ola1') {
    cambios = planAiCleanup(rows);
  } else {
    cambios = [];
    const bad = rows.filter((r) => hasImpossibleNutrition(r.nutriments));
    console.log(`[purge] ola3: ${bad.length} filas con nutrición imposible; releyendo sus fuentes`);
    for (const row of bad) {
      if (!row.barcode) {
        omitidas.push({ id: row.id, barcode: null, motivo: 'sin código de barras' });
        continue;
      }
      const result = await rereadNutrition(row.data_source, row.barcode);
      const delay = REREAD_DELAY_MS[row.data_source ?? ''] ?? REREAD_DEFAULT_DELAY_MS;
      await new Promise((r) => setTimeout(r, delay));
      if (result.status === 'error') {
        omitidas.push({ id: row.id, barcode: row.barcode, motivo: `error de lectura: ${result.message}` });
      } else if (result.status === 'sin_fuente') {
        omitidas.push({ id: row.id, barcode: row.barcode, motivo: `fuente desconocida: ${row.data_source}` });
      } else {
        cambios.push(planNutritionBlock(row, decideNutritionBlock(result.nutriments), row.data_source ?? '?'));
      }
    }
  }

  return {
    ola,
    generado: new Date().toISOString(),
    origen: { archivo: input, sha256: await sha256OfFile(input) },
    cambios,
    omitidas,
  };
}

async function readCurrent(id: string, columns: string[]): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin().from('products').select(columns.join(', ')).eq('id', id).maybeSingle();
  if (error) throw new Error(`no pude leer ${id}: ${error.message}`);
  return (data as Record<string, unknown> | null) ?? null;
}

async function applyPlan(plan: Plan, outDir: string): Promise<void> {
  const log = join(outDir, `${plan.ola}-resultado.jsonl`);
  let ok = 0;
  let omitidas = 0;
  for (const change of plan.cambios) {
    const columns = Object.keys(change.after);
    const current = await readCurrent(change.id, columns);
    const unchanged = current !== null && columns.every((c) => canonical(current[c]) === canonical(change.before[c]));
    if (!unchanged) {
      omitidas++;
      await appendFile(log, `${JSON.stringify({ id: change.id, resultado: 'omitida', motivo: 'la fila cambió desde el plan o no existe' })}\n`);
      continue;
    }

    const { data, error } = await admin().from('products').update(change.after).eq('id', change.id).select('id');
    if (error || !data || data.length !== 1) {
      await appendFile(log, `${JSON.stringify({ id: change.id, resultado: 'error', motivo: error?.message ?? 'no actualizó exactamente una fila' })}\n`);
      throw new Error(`falló la escritura de ${change.id}; filas escritas antes: ${ok}. Ver ${log}`);
    }

    const after = await readCurrent(change.id, columns);
    const verified = after !== null && columns.every((c) => canonical(after[c]) === canonical(change.after[c]));
    await appendFile(log, `${JSON.stringify({ id: change.id, barcode: change.barcode, resultado: verified ? 'ok' : 'relectura_distinta' })}\n`);
    if (!verified) throw new Error(`la relectura de ${change.id} no coincide con lo escrito; filas escritas: ${ok + 1}`);
    ok++;
  }
  console.log(`[purge] ${plan.ola}: ${ok} filas escritas y verificadas, ${omitidas} omitidas (de ${plan.cambios.length} del plan)`);
}

async function main() {
  const ola = process.argv[2] as Ola;
  if (!OLAS.includes(ola)) throw new Error(`Primer argumento: ${OLAS.join(' | ')}`);
  const outDir = argValue('--out-dir');
  if (!outDir) throw new Error('Falta --out-dir');

  if (process.argv.includes('--apply')) {
    const planPath = argValue('--plan');
    if (!planPath) throw new Error('--apply exige --plan <archivo del plan revisado>');
    const plan = JSON.parse(await readFile(planPath, 'utf8')) as Plan;
    if (plan.ola !== ola) throw new Error(`el plan es de ${plan.ola}, no de ${ola}`);
    await applyPlan(plan, outDir);
    return;
  }

  const input = argValue('--input');
  if (!input) throw new Error('Falta --input <export.jsonl>');
  const plan = await buildPlan(ola, input);
  const out = join(outDir, `${ola}-plan.json`);
  await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
  console.log(`[purge] SIMULACIÓN ${ola}: ${plan.cambios.length} filas afectadas, ${plan.omitidas.length} omitidas -> ${out}`);
  console.log('[purge] no se escribió nada en la base.');
}

main().catch((err) => {
  console.error('[purge] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
