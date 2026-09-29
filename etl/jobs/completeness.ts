// Uso: npm run etl:completeness
//
// Estado de los cinco campos que la app necesita para mostrar un producto
// con cara seria: nombre, marca, ingredientes, información nutricional e
// imagen. Solo lee; es seguro correrlo en cualquier momento.
//
// Existe porque veníamos midiendo esto con scripts efímeros en cada paso, y
// lo que importa no es la foto sino la tendencia: si una corrida deja el
// catálogo más completo o menos.
import 'dotenv/config';
import { admin } from '../lib/supabaseAdmin';

const PAGE_SIZE = 1000;
const norm = (x: unknown) => String(x ?? '').trim();

type Row = {
  barcode: string | null;
  product_name: string | null;
  brand: string | null;
  ingredients_text: string | null;
  nutriments: Record<string, unknown> | null;
  image_url: string | null;
  data_source: string | null;
};

/** Mismos criterios que usa el motor, no "el campo no es null". */
function checks(r: Row) {
  return {
    nombre: !!norm(r.product_name) && !/^\d{6,}$/.test(norm(r.product_name)),
    marca: !!norm(r.brand),
    ingredientes: norm(r.ingredients_text).length > 4,
    nutricion: !!r.nutriments && Object.keys(r.nutriments).length > 0,
    imagen: /^https?:\/\//i.test(norm(r.image_url)),
  };
}

async function main() {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin()
      .from('products')
      .select('barcode, product_name, brand, ingredients_text, nutriments, image_url, data_source')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const n = rows.length;
  const campos = ['nombre', 'marca', 'ingredientes', 'nutricion', 'imagen'] as const;
  const con: Record<string, number> = Object.fromEntries(campos.map((c) => [c, 0]));
  const porFuente = new Map<string, { total: number; completos: number }>();
  let completos = 0, escaneables = 0;

  for (const r of rows) {
    const ok = checks(r);
    for (const c of campos) if (ok[c]) con[c]++;
    const todos = campos.every((c) => ok[c]);
    if (todos) completos++;
    // "Escaneable": alcanza para que el usuario reconozca lo que escaneó,
    // aunque todavía no podamos puntuarlo.
    if (ok.nombre && ok.imagen) escaneables++;

    const src = r.data_source ?? '(sin fuente)';
    const acc = porFuente.get(src) ?? { total: 0, completos: 0 };
    acc.total++;
    if (todos) acc.completos++;
    porFuente.set(src, acc);
  }

  const pct = (x: number) => `${Math.round((x / Math.max(1, n)) * 100)}%`;
  console.log(`\nPRODUCTOS: ${n}\n`);
  console.log('campo            completos       %');
  for (const c of campos) console.log(`  ${c.padEnd(14)} ${String(con[c]).padStart(8)}   ${pct(con[c]).padStart(5)}`);
  console.log(`\n  reconocible al escanear (nombre + imagen): ${escaneables} (${pct(escaneables)})`);
  console.log(`  los cinco campos a la vez:                 ${completos} (${pct(completos)})`);

  console.log('\npor fuente        productos    completos');
  for (const [src, v] of [...porFuente].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${src.padEnd(15)} ${String(v.total).padStart(8)}   ${String(v.completos).padStart(8)} (${Math.round((v.completos / v.total) * 100)}%)`);
  }
}

main().catch((e) => {
  console.error('[completeness] error:', e);
  process.exit(1);
});
