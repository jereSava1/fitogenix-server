// Uso: npm run etl:stats
//
// Chequeo rápido de "¿qué trajimos hasta ahora?" — cuenta products_staging
// por fuente/estado, cuenta products, y muestra una muestra de los últimos
// productos escritos. Es el paso de verificación después de correr
// etl:off / etl:vtex / etl:merge.
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { admin } from '../lib/supabaseAdmin';

async function main() {
  const client = admin();

  const { data: staging, error: stagingErr } = await client
    .from('products_staging')
    .select('source, merge_status');

  if (stagingErr) {
    console.error('Error leyendo products_staging:', stagingErr.message);
  } else {
    const rows = staging as { source: string; merge_status: string }[];
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.source} / ${row.merge_status}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    console.log('\n=== products_staging (fuente / estado -> filas) ===');
    for (const [key, n] of [...counts.entries()].sort()) console.log(`  ${key}: ${n}`);
    console.log(`  TOTAL: ${rows.length}`);
  }

  const { count: productsCount, error: productsErr } = await client
    .from('products')
    .select('*', { count: 'exact', head: true });

  console.log('\n=== products ===');
  if (productsErr) console.error('Error leyendo products:', productsErr.message);
  else console.log(`  TOTAL filas: ${productsCount}`);

  const { data: sample, error: sampleErr } = await client
    .from('products')
    .select('barcode, product_name, brand, score, data_source, engine_version')
    .not('barcode', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (sampleErr) {
    console.error('Error leyendo muestra de products:', sampleErr.message);
  } else if (sample) {
    console.log('\n=== últimos 5 productos escritos (más recientes primero) ===');
    for (const p of sample as Record<string, unknown>[]) {
      console.log(
        `  ${p.barcode} — ${p.product_name} (${p.brand}) — score=${p.score} fuente=${p.data_source} engine=${p.engine_version}`,
      );
    }
  }
}

main().catch((err) => {
  console.error('[stats] error fatal:', err);
  process.exit(1);
});
