// Uso: npm run audit:scores [-- --rule <nombre>] [--limit 5000] [--sample 8]
//
// Audita el catálogo REAL contra el motor vigente y saca a la superficie los
// puntajes que no cierran, para que un humano los juzgue.
//
// Por qué existe: los tests unitarios detectan regresiones, no errores de
// criterio. Congelan lo que el motor hace hoy — si hoy está mal, lo congelan
// mal. La única forma de saber si un puntaje es CORRECTO es que alguien mire
// el producto y opine. Este script no decide nada: arma la cola de revisión,
// ordenada por cuánto huele cada caso.
//
// No escribe en la base. Es seguro correrlo con el ETL en curso.
import 'dotenv/config';
import { admin } from './etl/lib/supabaseAdmin';
import { ftgScoreWithBreakdown, type ProductInput } from '../src/domain/product/ftgEngine';

const PAGE_SIZE = 1000;

type Row = {
  barcode: string | null;
  product_name: string | null;
  brand: string | null;
  category: string | null;
  score: number | null;
  ingredients_text: string | null;
  nutriments: Record<string, unknown> | null;
  nova_group: number | null;
  additives_tags: string[] | null;
};

type Finding = {
  rule: string;
  /** Qué habría que verificar a mano, en una línea. */
  why: string;
  name: string;
  barcode: string;
  score: number;
  tier: string;
  coverage: number;
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

const DRINK = /bebida|gaseosa|refresco|jugo|soda|drink|beverage/i;
const PROCESSED_MEAT = /fiambre|salchich|jamón|jamon|mortadela|salame|chorizo|panceta|bacon|embutido/i;

/**
 * Cada regla describe una combinación que, si el motor acertó, tiene una
 * explicación; y si no la tiene, es un error. Ninguna es un veredicto: son
 * preguntas para un humano.
 */
function analyze(r: Row): Finding[] {
  const bd = ftgScoreWithBreakdown(toInput(r));
  const out: Finding[] = [];
  const base = {
    name: r.product_name ?? '(sin nombre)',
    barcode: r.barcode ?? '',
    score: bd.score,
    tier: bd.tier,
    coverage: bd.coverage,
  };
  const nutr = r.nutriments ?? {};
  const sugars = parseFloat(String(nutr['sugars_100g'] ?? nutr['sugars'] ?? '')) || 0;
  const haystack = `${r.product_name ?? ''} ${r.category ?? ''}`;

  // Lo más grave: afirmamos "Excelente" sin haber entendido la etiqueta.
  if (bd.tier === 'Excelente' && bd.coverage < 0.8) {
    out.push({ ...base, rule: 'excelente-sin-cobertura',
      why: `Excelente con solo ${Math.round(bd.coverage * 100)}% de ingredientes reconocidos.` });
  }

  // Un ultraprocesado en la banda alta necesita justificarse.
  if (r.nova_group === 4 && bd.score >= 75) {
    out.push({ ...base, rule: 'ultraprocesado-excelente',
      why: 'NOVA 4 puntuando como Excelente.' });
  }

  // Bebida azucarada que igual queda bien parada.
  if (DRINK.test(haystack) && sugars > 5 && bd.score >= 50) {
    out.push({ ...base, rule: 'bebida-azucarada-buena',
      why: `Bebida con ${sugars}g de azúcar/100g y puntaje ${bd.score}.` });
  }

  // Carne procesada sin compuerta: puede estar bien (sin nitritos declarados)
  // o puede ser que no detectamos el curado.
  if (PROCESSED_MEAT.test(haystack) && bd.score >= 50 && !bd.gateTriggered) {
    out.push({ ...base, rule: 'carne-procesada-sin-gate',
      why: 'Carne procesada en banda alta y sin compuerta de nitrito.' });
  }

  // El error opuesto, igual de dañino: castigar un alimento real.
  if (r.nova_group === 1 && bd.score < 50) {
    out.push({ ...base, rule: 'alimento-real-castigado',
      why: 'NOVA 1 (alimento mínimamente procesado) por debajo de Bueno.' });
  }

  // No es error del motor, es calidad de dato — pero define cuánto del
  // catálogo podemos mostrar con cara seria.
  if (!bd.scoreAvailable) {
    out.push({ ...base, rule: 'sin-puntaje-afirmable',
      why: `Cobertura ${Math.round(bd.coverage * 100)}%: el puntaje no es afirmable.` });
  }

  return out;
}

async function fetchAll(limit: number): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; from < limit; from += PAGE_SIZE) {
    const { data, error } = await admin()
      .from('products')
      .select('barcode, product_name, brand, category, score, ingredients_text, nutriments, nova_group, additives_tags')
      .not('ingredients_text', 'is', null)
      .order('barcode')
      .range(from, Math.min(from + PAGE_SIZE, limit) - 1);
    if (error) {
      console.error('[audit] error leyendo products:', error.message);
      break;
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, def?: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  return {
    rule: get('--rule'),
    limit: Number(get('--limit', '20000')),
    sample: Number(get('--sample', '8')),
  };
}

async function main() {
  const { rule, limit, sample } = parseArgs();
  const rows = await fetchAll(limit);
  console.log(`[audit] ${rows.length} productos con lista de ingredientes\n`);

  const findings = rows.flatMap(analyze);
  const byRule = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, []);
    byRule.get(f.rule)!.push(f);
  }

  if (rule) {
    const list = byRule.get(rule) ?? [];
    console.log(`=== ${rule} — ${list.length} casos ===\n`);
    for (const f of list) {
      console.log(`  ${String(f.score).padStart(3)} ${f.tier.padEnd(10)} cob=${String(Math.round(f.coverage * 100)).padStart(3)}%  ${f.name.slice(0, 46).padEnd(46)} ${f.barcode}`);
    }
    return;
  }

  console.log('=== Cola de revisión (ordenada por cantidad) ===\n');
  const ordered = [...byRule.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [name, list] of ordered) {
    const pct = ((list.length / rows.length) * 100).toFixed(1);
    console.log(`── ${name}: ${list.length} (${pct}% del catálogo)`);
    console.log(`   ${list[0].why}`);
    for (const f of list.slice(0, sample)) {
      console.log(`     ${String(f.score).padStart(3)} ${f.tier.padEnd(10)} cob=${String(Math.round(f.coverage * 100)).padStart(3)}%  ${f.name.slice(0, 44)}`);
    }
    if (list.length > sample) console.log(`     … y ${list.length - sample} más (npm run audit:scores -- --rule ${name})`);
    console.log('');
  }

  const limpios = rows.length - new Set(findings.map((f) => f.barcode)).size;
  console.log(`Sin observaciones: ${limpios} de ${rows.length} (${((limpios / rows.length) * 100).toFixed(1)}%)`);
}

main().catch((e) => {
  console.error('[audit] error fatal:', e);
  process.exit(1);
});
