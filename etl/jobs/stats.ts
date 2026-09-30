// Uso: npm run etl:stats
// Staging por fuente y estado, total de `products` y los últimos productos escritos.
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { admin } from '../lib/supabaseAdmin';
import { fetchStagingStatusRows } from '../lib/staging';
import { ENGINE_VERSION, scoreProduct } from '../../src/modules/scoring';

async function main() {
  const client = admin();

  // Paginado (ver fetchStagingStatusRows): un `.select()` pelado se corta en
  // 1000 filas sin error, y estos conteos quedaban clavados en ese techo.
  const rows = await fetchStagingStatusRows();
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.source} / ${row.merge_status}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log('\n=== products_staging (fuente / estado -> filas) ===');
  for (const [key, n] of [...counts.entries()].sort()) console.log(`  ${key}: ${n}`);
  console.log(`  TOTAL: ${rows.length}`);

  const { count: productsCount, error: productsErr } = await client
    .from('products')
    .select('*', { count: 'exact', head: true });

  console.log('\n=== products ===');
  if (productsErr) console.error('Error leyendo products:', productsErr.message);
  else console.log(`  TOTAL filas: ${productsCount}`);

  const { data: sample, error: sampleErr } = await client
    .from('products')
    .select('barcode, product_name, brand, category, ingredients_text, nutriments, additives_tags, data_source')
    .not('barcode', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (sampleErr) {
    console.error('Error leyendo muestra de products:', sampleErr.message);
  } else if (sample) {
    console.log(`\n=== últimos 5 productos escritos (más recientes primero; puntaje con ${ENGINE_VERSION}) ===`);
    for (const p of sample as Record<string, unknown>[]) {
      const { score } = scoreProduct({
        ingredients_text: (p.ingredients_text as string | null) ?? undefined,
        nutriments: (p.nutriments as Record<string, unknown> | null) ?? {},
        additives_tags: (p.additives_tags as string[] | null) ?? [],
        categories: (p.category as string | null) ?? undefined,
      });
      console.log(`  ${p.barcode} — ${p.product_name} (${p.brand}) — score=${score} fuente=${p.data_source}`);
    }
  }
}

main().catch((err) => {
  console.error('[stats] error fatal:', err);
  process.exit(1);
});
