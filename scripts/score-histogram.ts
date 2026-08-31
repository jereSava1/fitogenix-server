// Uso: npx tsx scripts/score-histogram.ts [--limit 20000]
//
// Complementa a audit-scores.ts. Aquel arma una cola de revisión por reglas;
// éste responde tres preguntas que las reglas no contestan:
//
//   1. ¿Cómo se distribuyen los puntajes? En particular, ¿cuántos productos
//      caen en 70-74? (define si mover el sello de 75 a 70 cambia algo real)
//   2. ¿Por qué el motor no puntúa el 28.7% del catálogo? Desglose por código.
//   3. ¿Qué términos no identificados aparecen más? audit-scores.ts ya los
//      cuenta en CURATION_QUEUE pero nunca los imprime — es la cola de
//      curaduría, y es la palanca para recuperar catálogo sin tocar el motor.
//
// No escribe en la base. Seguro de correr con el ETL en curso.
import 'dotenv/config';
import { admin } from './etl/lib/supabaseAdmin';
import { ftgScoreWithBreakdown, type ProductInput } from '../src/domain/product/ftgEngine';

const PAGE_SIZE = 1000;

type Row = {
  barcode: string | null;
  product_name: string | null;
  category: string | null;
  ingredients_text: string | null;
  nutriments: Record<string, unknown> | null;
  nova_group: number | null;
  additives_tags: string[] | null;
};

function toInput(r: Row): ProductInput {
  return {
    ingredients_text: r.ingredients_text ?? undefined,
    nutriments: r.nutriments ?? {},
    nova_group: r.nova_group ?? undefined,
    additives_tags: r.additives_tags ?? [],
    categories: r.category ?? undefined,
  };
}

async function fetchAll(limit: number): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; from < limit; from += PAGE_SIZE) {
    const { data, error } = await admin()
      .from('products')
      .select('barcode, product_name, category, ingredients_text, nutriments, nova_group, additives_tags')
      .not('ingredients_text', 'is', null)
      .order('barcode')
      .range(from, Math.min(from + PAGE_SIZE, limit) - 1);
    if (error) { console.error('[hist] error leyendo products:', error.message); break; }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function bar(n: number, max: number, width = 44): string {
  if (max === 0) return '';
  return '█'.repeat(Math.max(n > 0 ? 1 : 0, Math.round((n / max) * width)));
}

async function main() {
  const args = process.argv.slice(2);
  const li = args.indexOf('--limit');
  const limit = li >= 0 ? Number(args[li + 1]) : 20000;

  const rows = await fetchAll(limit);
  console.log(`[hist] ${rows.length} productos con lista de ingredientes\n`);

  const buckets = new Map<number, number>();     // decena → cantidad
  const tiers = new Map<string, number>();
  const noScoreCodes = new Map<string, number>();
  const unidentified = new Map<string, number>();
  const coverageNoScore: number[] = [];
  const window7074: { score: number; name: string; barcode: string; cov: number }[] = [];
  let scored = 0;

  for (const r of rows) {
    const bd = ftgScoreWithBreakdown(toInput(r));
    for (const t of bd.unidentified) unidentified.set(t, (unidentified.get(t) ?? 0) + 1);

    if (!bd.scoreAvailable || bd.score == null) {
      const code = bd.noScore?.code ?? 'sin-codigo';
      noScoreCodes.set(code, (noScoreCodes.get(code) ?? 0) + 1);
      coverageNoScore.push(bd.coverage);
      continue;
    }
    scored++;
    const decade = Math.min(90, Math.floor(bd.score / 10) * 10);
    buckets.set(decade, (buckets.get(decade) ?? 0) + 1);
    tiers.set(bd.tier, (tiers.get(bd.tier) ?? 0) + 1);
    if (bd.score >= 70 && bd.score <= 74) {
      window7074.push({
        score: bd.score,
        name: (r.product_name ?? '(sin nombre)').slice(0, 44),
        barcode: r.barcode ?? '',
        cov: bd.coverage,
      });
    }
  }

  // ── 1. Distribución ──────────────────────────────────────────────────────
  console.log('=== Distribución de puntajes (solo los que el motor puntúa) ===\n');
  const maxB = Math.max(...buckets.values(), 1);
  for (let d = 0; d <= 90; d += 10) {
    const n = buckets.get(d) ?? 0;
    const pct = scored ? ((n / scored) * 100).toFixed(1) : '0.0';
    console.log(`  ${String(d).padStart(2)}-${String(d + 9).padStart(2)}  ${String(n).padStart(5)}  ${pct.padStart(5)}%  ${bar(n, maxB)}`);
  }
  console.log(`\n  con puntaje: ${scored} · sin puntaje: ${rows.length - scored}`);

  console.log('\n=== Por banda ===\n');
  for (const [t, n] of [...tiers.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(12)} ${String(n).padStart(5)}  ${((n / scored) * 100).toFixed(1)}%`);
  }

  // ── 2. LA PREGUNTA: la ventana 70-74 ─────────────────────────────────────
  console.log('\n=== ⭐ Ventana 70-74 — la que decide si mover el sello sirve ===\n');
  console.log(`  Productos con puntaje entre 70 y 74: ${window7074.length}`);
  console.log(`  Sobre los ${scored} puntuados: ${scored ? ((window7074.length / scored) * 100).toFixed(2) : '0'}%`);
  console.log(`  Sobre el catálogo entero (${rows.length}): ${((window7074.length / rows.length) * 100).toFixed(2)}%\n`);
  for (const p of window7074.slice(0, 25)) {
    console.log(`    ${p.score}  cob=${String(Math.round(p.cov * 100)).padStart(3)}%  ${p.name.padEnd(46)} ${p.barcode}`);
  }
  if (window7074.length > 25) console.log(`    … y ${window7074.length - 25} más`);
  if (window7074.length === 0) {
    console.log('    (vacía — bajar el sello a 70 no le daría el sello a ningún producto actual)');
  }

  // ── 3. Por qué no se puntúa el resto ─────────────────────────────────────
  console.log('\n=== Sin puntaje: desglose por código (§1) ===\n');
  for (const [code, n] of [...noScoreCodes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(28)} ${String(n).padStart(5)}  ${((n / rows.length) * 100).toFixed(1)}% del catálogo`);
  }
  if (coverageNoScore.length) {
    const avg = coverageNoScore.reduce((a, b) => a + b, 0) / coverageNoScore.length;
    const cero = coverageNoScore.filter((c) => c === 0).length;
    console.log(`\n  cobertura promedio de los sin puntaje: ${(avg * 100).toFixed(1)}%`);
    console.log(`  de esos, con 0% de ingredientes reconocidos: ${cero}`);
  }

  // ── 4. La palanca: cola de curaduría ─────────────────────────────────────
  console.log('\n=== ⭐ Cola de curaduría — términos no identificados más frecuentes ===');
  console.log('    (cada uno que se agregue a ingredientData.ts recupera catálogo\n');
  console.log('     sin tocar el motor ni la base)\n');
  const top = [...unidentified.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  const maxU = top[0]?.[1] ?? 1;
  for (const [term, n] of top) {
    console.log(`  ${String(n).padStart(5)}  ${term.slice(0, 42).padEnd(44)} ${bar(n, maxU, 24)}`);
  }
  console.log(`\n  términos distintos sin identificar en todo el catálogo: ${unidentified.size}`);
  const totalHits = [...unidentified.values()].reduce((a, b) => a + b, 0);
  const top40Hits = top.reduce((a, [, n]) => a + n, 0);
  console.log(`  apariciones totales: ${totalHits} · cubiertas por el top 40: ${totalHits ? ((top40Hits / totalHits) * 100).toFixed(1) : '0'}%`);
}

main().catch((e) => { console.error('[hist] error fatal:', e); process.exit(1); });
