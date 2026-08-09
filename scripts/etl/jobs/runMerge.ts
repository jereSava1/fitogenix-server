// Uso: npm run etl:merge -- [--limit 200] [--enrich]
//
// Lee filas `pending` de products_staging, las mergea por barcode (Fase 3b),
// aplica el gate de completitud (3c), opcionalmente enriquece gaps con Claude
// (--enrich, GASTA TOKENS — no correr sin límite sin el ok del Agente de
// Datos, ver 05-agente-datos.md), y upsertea a `products` reusando
// buildCachePayload (mismo contrato que un lookup online). Ver
// 06-agente-etl-data.md, Fases 3 y 4.
//
// v1: procesa un barcode a la vez (no bulk-batch de 500-1000 filas todavía).
// Correcto para el volumen de validación (cientos/pocos miles). Optimizar a
// upsert en lote es trabajo de escalado posterior, una vez validado esto.
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { admin } from '../lib/supabaseAdmin';
import {
  fetchAllRowsForBarcode,
  fetchPendingBarcodes,
  fetchPendingRowsForBarcode,
  markStagingRows,
} from '../lib/staging';
import { mergeRawProducts, primarySourceOf } from '../lib/merge';
import { isComplete } from '../lib/completeness';
import { mapOFFToProduct } from '../../../src/services/productLookupService';
import { buildCachePayload } from '../../../src/services/cacheService';
import { enrichWithAI } from '../../../src/services/claudeService';

function parseArgs() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  return {
    limit: limitIdx >= 0 ? Number(args[limitIdx + 1]) : 200,
    enrich: args.includes('--enrich'),
  };
}

async function main() {
  const { limit, enrich } = parseArgs();
  console.log(`[runMerge] limit=${limit} enrich=${enrich ? 'SÍ (gasta tokens de Claude)' : 'no'}`);

  // Con --enrich, también se reintentan las filas que quedaron
  // `discarded_incomplete` en una corrida anterior — Claude puede completar
  // ahora lo que antes faltaba. Sin --enrich, solo `pending` (reintentar un
  // descarte sin enrichment daría el mismo resultado, no tiene sentido).
  const barcodes = await fetchPendingBarcodes(limit, enrich);
  console.log(`[runMerge] ${barcodes.length} barcodes para procesar${enrich ? ' (incluye descartes previos, reintentables con --enrich)' : ''}`);

  let merged = 0;
  let enrichedCount = 0;
  let discarded = 0;

  for (const barcode of barcodes) {
    // `trigger` = filas pending/discarded de ESTA corrida — son las que hay
    // que marcar al terminar. `allRows` = TODO el historial de ese barcode
    // (cualquier estado) — es lo que entra al merge, para que una fila vieja
    // ya `merged`/`discarded_incomplete` nunca quede huérfana ni se
    // re-procese sola en una corrida futura (ver comentario en
    // fetchAllRowsForBarcode).
    const trigger = await fetchPendingRowsForBarcode(barcode, enrich);
    if (trigger.length === 0) continue;
    const allRows = await fetchAllRowsForBarcode(barcode);

    const entries = allRows.map((r) => ({ source: r.source, raw: r.raw }));
    let combined = mergeRawProducts(entries);
    const ids = trigger.map((r) => r.id);
    let wasEnriched = false;

    // Gate de DATOS vs. gate de SCORING (migración 010). Que no alcance para
    // puntuar no significa que el producto no sirva: el nombre, la marca y la
    // imagen son lo que le permite al usuario reconocer lo que escaneó, y sin
    // ellos ese código cae a la cascada cara en vez de resolverse local.
    // Entra igual, marcado como incompleto; el motor ya sabe declarar que no
    // puede puntuar (scoreAvailable/coverage).
    let incomplete = false;
    if (!isComplete(combined)) {
      if (enrich) {
        combined = await enrichWithAI(combined);
        wasEnriched = true;
      }
      incomplete = !isComplete(combined);
    }

    const product = mapOFFToProduct(combined, barcode);
    // mapOFFToProduct asume 'off' por defecto salvo _aiSource — acá lo
    // pisamos con la fuente real que ganó el merge (puede ser un retailer,
    // no solo 'off'/'obf'/'edamam'/'ai'). `data_source` es TEXT libre, no
    // hay CHECK constraint que lo restrinja — extender con nombres de
    // retailer es válido y trazable.
    if (!combined._aiSource) product.dataSource = primarySourceOf(entries);

    const payload = buildCachePayload(product, combined, { barcode });

    const { data, error } = await admin()
      .from('products')
      .upsert(payload, { onConflict: 'barcode' })
      .select('id')
      .single();

    if (error || !data) {
      console.error(`[runMerge] upsert falló para ${barcode}:`, error?.message);
      continue;
    }

    const productId = (data as { id: string }).id;
    const status = incomplete ? 'merged_incomplete' : wasEnriched ? 'enriched' : 'merged';
    await markStagingRows(ids, status, {
      mergedInto: productId,
      discardReason: incomplete
        ? 'sin ingredientes ni tabla nutricional: escrito igual, pendiente de enriquecimiento'
        : undefined,
    });
    merged++;
    if (incomplete) discarded++; // se contabiliza aparte en el resumen
    if (wasEnriched) enrichedCount++;

    if (merged % 50 === 0) {
      console.log(`[runMerge] progreso: ${merged} mergeados (${enrichedCount} enriquecidos), ${discarded} descartados`);
    }
  }

  console.log(
    `[runMerge] listo. escritos=${merged} · de esos, sin datos para puntuar=${discarded} · enriquecidos con IA=${enrichedCount}`,
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
