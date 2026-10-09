// Uso (simulación por defecto, no escribe nada):
//   npm run etl:fix-barcodes -- --input export.jsonl --out-dir dir
// Deja `ola2-plan.json`: filas a corregir (barcode), a borrar (fila completa) y en lista.
// Aplicar lo revisado:
//   npm run etl:fix-barcodes -- --plan dir/ola2-plan.json --out-dir dir --apply
// Corrige el código completando ceros (9 a 11 dígitos con verificador válido y confirmado por la
// fuente), borra solo lo que la fuente no permite recuperar y nadie referencia. Nunca un filtro abierto.
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { admin } from '../lib/supabaseAdmin';
import { hasValidGtinCheckDigit } from '../lib/barcode';
import { barcodeStatus } from '../lib/auditRow';
import { readJsonl, sha256OfFile } from '../lib/productsExport';
import {
  duplicateVerdict, reproducibleSample, zeroPaddedCandidate, type RepairRow,
} from '../lib/barcodeRepair';
import { lookupPublishedCode } from '../lib/sourceReread';

type Row = RepairRow & Record<string, unknown>;
type Change =
  | { accion: 'corregir'; id: string; barcode: string; before: { barcode: string }; after: { barcode: string }; motivo: string }
  | { accion: 'borrar'; id: string; barcode: string; fila: Row; stagingQueApuntan: string[]; motivo: string };
type Listed = { id: string; barcode: string | null; motivo: string; otraFila?: Row };
type Plan = {
  generado: string;
  origen: { archivo: string; sha256: string };
  cambios: Change[];
  lista: Listed[];
  verificacion: { muestraVtex: number; fallasVtex: string[]; offVerificadas: number };
};

const SAMPLE_SIZE = 100;
const STANDARD = new Set([8, 12, 13, 14]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const delayFor = (source: string | null) => (source === 'off' ? 4500 : 400);

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

async function referencedIds(ids: string[], withStaging = true): Promise<{ usuario: Set<string>; staging: Map<string, string[]> }> {
  const usuario = new Set<string>();
  const staging = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    for (const table of ['saved_products', 'scan_history', 'product_reports']) {
      const { data, error } = await admin().from(table).select('product_id').in('product_id', chunk);
      if (error) throw new Error(`no pude leer ${table}: ${error.message}`);
      for (const r of data as { product_id: string }[]) usuario.add(r.product_id);
    }
    if (!withStaging) continue;
    const { data, error } = await admin().from('products_staging').select('id, merged_into').in('merged_into', chunk);
    if (error) throw new Error(`no pude leer products_staging: ${error.message}`);
    for (const r of data as { id: string; merged_into: string }[]) {
      staging.set(r.merged_into, [...(staging.get(r.merged_into) ?? []), r.id]);
    }
  }
  return { usuario, staging };
}

async function buildPlan(input: string): Promise<Plan> {
  const rows: Row[] = [];
  for await (const r of readJsonl(input)) rows.push(r as Row);
  const byBarcode = new Map(rows.filter((r) => r.barcode).map((r) => [r.barcode as string, r]));
  const bad = rows.filter((r) => ['longitud_no_estandar', 'digito_malo'].includes(barcodeStatus(r.barcode)));
  const { usuario, staging } = await referencedIds(bad.map((r) => r.id));
  console.log(`[fix-barcodes] ${bad.length} filas con código inválido; ${usuario.size} referenciadas por guardados/historial/reportes`);

  const cambios: Change[] = [];
  const lista: Listed[] = [];
  const claimed = new Set<string>(); // códigos nuevos ya asignados en este plan
  const toVerify: { row: Row; padded: string }[] = [];

  const del = (row: Row, motivo: string) =>
    cambios.push({ accion: 'borrar', id: row.id, barcode: row.barcode as string, fila: row, stagingQueApuntan: staging.get(row.id) ?? [], motivo });

  for (const row of bad) {
    const code = row.barcode as string;
    const padded = zeroPaddedCandidate(code);
    if (padded) {
      const other = byBarcode.get(padded);
      if (other) {
        if (duplicateVerdict(row, other, usuario.has(row.id)) === 'borrar') {
          del(row, `duplicado vacío de ${padded} (fila ${other.id})`);
        } else {
          lista.push({ id: row.id, barcode: code, motivo: `choca con la fila ${other.id} que ya tiene ${padded}; la inválida tiene datos o está referenciada`, otraFila: other });
        }
      } else if (claimed.has(padded)) {
        lista.push({ id: row.id, barcode: code, motivo: `otra fila inválida del plan completa al mismo código ${padded}` });
      } else {
        claimed.add(padded);
        toVerify.push({ row, padded });
      }
      continue;
    }

    // Sin relleno posible: solo vale el código que publique la fuente.
    await sleep(delayFor(row.data_source));
    const found = await lookupPublishedCode(row.data_source, code);
    if (found.status !== 'ok') {
      lista.push({ id: row.id, barcode: code, motivo: found.status === 'error' ? `error de lectura: ${found.message}` : `fuente desconocida: ${row.data_source}` });
      continue;
    }
    const published = found.published;
    const valid = published && STANDARD.has(published.length) && hasValidGtinCheckDigit(published);
    if (valid && published !== code) {
      if (byBarcode.has(published) || claimed.has(published)) {
        lista.push({ id: row.id, barcode: code, motivo: `la fuente lo publica como ${published}, que ya existe`, otraFila: byBarcode.get(published) });
      } else {
        claimed.add(published);
        cambios.push({ accion: 'corregir', id: row.id, barcode: code, before: { barcode: code }, after: { barcode: published }, motivo: `la fuente (${row.data_source}) publica el producto con el GTIN válido ${published}` });
      }
    } else if (code.length < 8) {
      lista.push({ id: row.id, barcode: code, motivo: 'código de menos de 8 dígitos sin GTIN válido en la fuente: no se borra' });
    } else if (usuario.has(row.id)) {
      lista.push({ id: row.id, barcode: code, motivo: 'la fuente no permite recuperar un GTIN válido, pero la fila está referenciada por guardados/historial' });
    } else {
      del(row, published ? 'la fuente publica el mismo código inválido' : 'la fuente no publica el producto con un GTIN válido');
    }
  }

  // Verificación de los rellenos: muestra reproducible de VTEX y todas las de OFF.
  const vtex = toVerify.filter((v) => v.row.data_source !== 'off');
  const off = toVerify.filter((v) => v.row.data_source === 'off');
  const sample = new Set(reproducibleSample(vtex.map((v) => v.row), SAMPLE_SIZE).map((r) => r.id));
  const fallasVtex: string[] = [];
  for (const v of vtex.filter((x) => sample.has(x.row.id))) {
    await sleep(delayFor(v.row.data_source));
    const found = await lookupPublishedCode(v.row.data_source, v.row.barcode as string);
    if (found.status !== 'ok' || found.published !== v.row.barcode) {
      fallasVtex.push(`${v.row.barcode} (${v.row.data_source}): ${found.status === 'ok' ? 'la fuente no lo publica recortado' : found.status}`);
    }
  }
  console.log(`[fix-barcodes] muestra VTEX: ${sample.size} verificadas, ${fallasVtex.length} fallas`);

  let offVerificadas = 0;
  const confirmed = [...vtex];
  for (const v of off) {
    await sleep(delayFor('off'));
    const found = await lookupPublishedCode('off', v.padded);
    if (found.status === 'ok' && found.published) { offVerificadas++; confirmed.push(v); }
    else lista.push({ id: v.row.id, barcode: v.row.barcode, motivo: `OFF no publica el producto con el código completo ${v.padded} (${found.status === 'error' ? found.message : 'sin resultado'})` });
  }

  if (fallasVtex.length === 0) {
    for (const v of confirmed) {
      cambios.push({ accion: 'corregir', id: v.row.id, barcode: v.row.barcode as string, before: { barcode: v.row.barcode as string }, after: { barcode: v.padded }, motivo: 'cero inicial recortado; el verificador valida y la fuente confirma el producto' });
    }
  } else {
    for (const v of confirmed) lista.push({ id: v.row.id, barcode: v.row.barcode, motivo: 'la muestra de verificación tuvo fallas: no se corrige' });
  }

  return {
    generado: new Date().toISOString(),
    origen: { archivo: input, sha256: await sha256OfFile(input) },
    cambios, lista,
    verificacion: { muestraVtex: sample.size, fallasVtex, offVerificadas },
  };
}

async function applyPlan(plan: Plan, outDir: string): Promise<void> {
  const log = join(outDir, 'ola2-resultado.jsonl');
  const count = { corregidas: 0, borradas: 0, omitidas: 0 };
  const say = (o: object) => appendFile(log, `${JSON.stringify(o)}\n`);

  for (const c of plan.cambios) {
    const { data: current, error } = await admin().from('products').select('*').eq('id', c.id).maybeSingle();
    if (error) throw new Error(`no pude leer ${c.id}: ${error.message}`);
    const expected = c.accion === 'borrar' ? c.fila : null;
    const unchanged = current && (c.accion === 'borrar' ? canonical(current) === canonical(expected) : (current as Row).barcode === c.before.barcode);
    if (!unchanged) { count.omitidas++; await say({ id: c.id, resultado: 'omitida', motivo: 'la fila cambió desde el plan o no existe' }); continue; }

    if (c.accion === 'corregir') {
      const { data, error: e } = await admin().from('products').update({ barcode: c.after.barcode }).eq('id', c.id).select('id');
      if (e || !data || data.length !== 1) { await say({ id: c.id, resultado: 'error', motivo: e?.message }); throw new Error(`falló ${c.id}: ${e?.message}; corregidas antes: ${count.corregidas}, borradas: ${count.borradas}`); }
      const { data: after } = await admin().from('products').select('barcode').eq('id', c.id).maybeSingle();
      const ok = (after as { barcode?: string } | null)?.barcode === c.after.barcode;
      await say({ id: c.id, accion: 'corregir', resultado: ok ? 'ok' : 'relectura_distinta' });
      if (!ok) throw new Error(`relectura distinta en ${c.id}`);
      count.corregidas++;
    } else {
      const refs = await referencedIds([c.id], false);
      if (refs.usuario.has(c.id)) { count.omitidas++; await say({ id: c.id, resultado: 'omitida', motivo: 'ahora está referenciada' }); continue; }
      const { data, error: e } = await admin().from('products').delete().eq('id', c.id).select('id');
      if (e || !data || data.length !== 1) { await say({ id: c.id, resultado: 'error', motivo: e?.message }); throw new Error(`falló el borrado de ${c.id}: ${e?.message}; corregidas: ${count.corregidas}, borradas: ${count.borradas}`); }
      const { data: gone } = await admin().from('products').select('id').eq('id', c.id).maybeSingle();
      await say({ id: c.id, accion: 'borrar', resultado: gone ? 'sigue_existiendo' : 'ok' });
      if (gone) throw new Error(`${c.id} sigue existiendo tras el borrado`);
      count.borradas++;
    }
  }
  console.log(`[fix-barcodes] corregidas ${count.corregidas}, borradas ${count.borradas}, omitidas ${count.omitidas} (de ${plan.cambios.length} del plan)`);
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
  if (!input) throw new Error('Falta --input <export.jsonl>');
  const plan = await buildPlan(input);
  const out = join(outDir, 'ola2-plan.json');
  await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
  const n = (a: string) => plan.cambios.filter((c) => c.accion === a).length;
  console.log(`[fix-barcodes] SIMULACIÓN: corregir ${n('corregir')}, borrar ${n('borrar')}, lista ${plan.lista.length} -> ${out}`);
  console.log('[fix-barcodes] no se escribió nada en la base.');
}

main().catch((err) => {
  console.error('[fix-barcodes] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
