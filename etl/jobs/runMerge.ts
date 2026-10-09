// Uso: npm run etl:merge -- [--limit 200] [--retry-discarded]
// Staging `pending` → merge por barcode → gate de completitud → upsert en `products`, de a
// lotes. Nunca completa datos con IA (D-92).
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { admin } from '../lib/supabaseAdmin';

/** Barcodes por lote. 500 mantiene la URL del `in(...)` dentro de lo que
 *  acepta PostgREST y el payload del upsert en un tamaño razonable. */
const BATCH_SIZE = 500;
import {
  fetchPendingBarcodes,
  fetchRowsForBarcodes,
  markStagingRowsBulk,
  type StagingRowFull,
} from '../lib/staging';
import { mergeRawProducts, primarySourceOf } from '../lib/merge';
import type { NutritionBasis, RawProduct } from '../../src/modules/catalog';
import { isComplete } from '../lib/completeness';
import { buildCachePayload } from '../../src/modules/catalog';

function parseArgs() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  return {
    limit: limitIdx >= 0 ? Number(args[limitIdx + 1]) : 200,
    // Reintenta las filas que quedaron `discarded_incomplete` con la regla
    // vieja (previa a la migración 010): hoy esa falta de
    // ingredientes ya no descarta el producto, solo lo marca.
    retryDiscarded: args.includes('--retry-discarded'),
  };
}

/** Los productos del lote que ya existen, como RawProduct: entran al merge como una fuente más. */
async function fetchExistingProducts(barcodes: string[]): Promise<Map<string, RawProduct>> {
  const out = new Map<string, RawProduct>();
  if (barcodes.length === 0) return out;

  const { data, error } = await admin()
    .from('products')
    .select('barcode, product_name, brand, category, image_url, ingredients_text, nutriments, nutrition_basis, additives_tags')
    .in('barcode', barcodes);

  if (error || !data) {
    console.error('[runMerge] no pude leer los productos existentes:', error?.message);
    return out;
  }

  for (const r of data as Record<string, unknown>[]) {
    out.set(String(r.barcode), {
      product_name: (r.product_name as string) ?? undefined,
      brands: (r.brand as string) ?? undefined,
      categories: (r.category as string) ?? undefined,
      image_url: (r.image_url as string) ?? undefined,
      ingredients_text: (r.ingredients_text as string) ?? undefined,
      nutriments: (r.nutriments as Record<string, unknown>) ?? undefined,
      nutrition_basis: (r.nutrition_basis as NutritionBasis | null) ?? undefined,
      additives_tags: (r.additives_tags as string[]) ?? undefined,
    });
  }
  return out;
}

async function main() {
  const { limit, retryDiscarded } = parseArgs();
  const includeDiscarded = retryDiscarded;
  console.log(`[runMerge] limit=${limit}`);

  const barcodes = await fetchPendingBarcodes(limit, includeDiscarded);
  console.log(`[runMerge] ${barcodes.length} barcodes para procesar${includeDiscarded ? ' (incluye descartes previos)' : ''}`);

  let merged = 0;
  let discarded = 0;
  let procesados = 0;

  for (let i = 0; i < barcodes.length; i += BATCH_SIZE) {
    const chunk = barcodes.slice(i, i + BATCH_SIZE);
    const rowsByBarcode = await fetchRowsForBarcodes(chunk);
    const existingByBarcode = await fetchExistingProducts(chunk);

    const payloads: Record<string, unknown>[] = [];
    // barcode -> filas que hay que marcar y con qué estado, una vez que
    // sepamos el id del producto resultante.
    const pending: { barcode: string; rows: StagingRowFull[]; incomplete: boolean }[] = [];

    for (const barcode of chunk) {
      const allRows = rowsByBarcode.get(barcode) ?? [];
      if (allRows.length === 0) continue;

      // Solo se marcan las filas que ESTA corrida tomó; las ya procesadas
      // entran al merge pero conservan su estado.
      const triggerStatuses = includeDiscarded ? ['pending', 'discarded_incomplete'] : ['pending'];
      const trigger = allRows.filter((r) => triggerStatuses.includes(r.merge_status));
      if (trigger.length === 0) continue;

      // Lo que ya está en `products` entra al merge como una fuente más, de
      // prioridad mínima: llena huecos y nunca pisa una fuente fresca. Es lo
      // que evita que una corrida borre datos que llegaron por otro camino.
      const existing = existingByBarcode.get(barcode);
      const entries = [
        ...allRows.map((r) => ({ source: r.source, raw: r.raw })),
        ...(existing ? [{ source: 'existing', raw: existing }] : []),
      ];
      const combined = mergeRawProducts(entries, barcode);

      // Gate de DATOS vs. gate de SCORING (migración 010). Que no alcance para
      // puntuar no significa que el producto no sirva: el nombre, la marca y la
      // imagen son lo que le permite al usuario reconocer lo que escaneó.
      let incomplete = false;
      if (!isComplete(combined)) incomplete = true;

      const payload = buildCachePayload(combined, barcode);
      // El origen es la fuente de más prioridad del merge (off, vtex…).
      payload.data_source = primarySourceOf(entries);
      payloads.push(payload);
      pending.push({ barcode, rows: trigger, incomplete });
    }

    if (payloads.length === 0) continue;

    // Un solo upsert para todo el lote, devolviendo los ids para poder
    // trazar qué fila de staging fue a qué producto.
    const { data, error } = await admin()
      .from('products')
      .upsert(payloads, { onConflict: 'barcode' })
      .select('id, barcode');

    if (error || !data) {
      console.error(`[runMerge] upsert del lote falló (${payloads.length} productos):`, error?.message);
      continue;
    }

    const idByBarcode = new Map<string, string>();
    for (const row of data as { id: string; barcode: string }[]) idByBarcode.set(row.barcode, row.id);

    const updates = pending.flatMap((p) => {
      const mergedInto = idByBarcode.get(p.barcode);
      if (!mergedInto) return [];
      const status = p.incomplete ? ('merged_incomplete' as const) : ('merged' as const);
      return p.rows.map((row) => ({ row, status, mergedInto }));
    });
    await markStagingRowsBulk(updates);

    for (const p of pending) {
      merged++;
      if (p.incomplete) discarded++;
    }
    procesados += chunk.length;

    console.log(
      `[runMerge] ${procesados}/${barcodes.length} barcodes · escritos ${merged} · sin datos para puntuar ${discarded}`,
    );
  }

  console.log(
    `[runMerge] listo. escritos=${merged} · de esos, sin datos para puntuar=${discarded}`,
  );
  if (discarded > 0) {
    console.log(
      `[runMerge] ${discarded} productos entraron sin ingredientes. Siguiente paso: npm run etl:enrich-cencosud`,
    );
  }
  console.log('[runMerge] siguiente paso: npm run etl:stats   (ver qué quedó en products_staging y products)');
}

main().catch((err) => {
  console.error('[runMerge] error fatal:', err);
  process.exit(1);
});
