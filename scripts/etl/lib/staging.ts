// Lectura/escritura de `products_staging` (migrations/009_products_staging.sql).
// Ningún adapter ni job escribe directo a `products` — todo pasa por acá primero.
// Ver 06-agente-etl-data.md, Fase 3.
import { admin } from './supabaseAdmin';
import type { RawOFFProduct } from '../../../src/types/fitogenix';

export type StagingInsert = {
  source: string;
  barcode: string | null;
  raw: RawOFFProduct;
  runId: string;
};

const BATCH_SIZE = 500;

/** Inserta filas crudas en products_staging en lotes de BATCH_SIZE. */
export async function insertStagingRows(rows: StagingInsert[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
      source: r.source,
      barcode: r.barcode,
      raw_payload: r.raw,
      run_id: r.runId,
      merge_status: 'pending',
    }));

    const { error, count } = await admin()
      .from('products_staging')
      .insert(batch, { count: 'exact' });

    if (error) {
      console.error(`[staging] insert batch error (offset ${i}):`, error.message);
      continue;
    }
    inserted += count ?? batch.length;
  }
  return inserted;
}

export type PendingStagingRow = { id: string; source: string; raw: RawOFFProduct };

// `discarded_incomplete` NO es un estado terminal — es un "soft fail"
// reintentable. Una fila que se descartó porque le faltaba `ingredients_text`/
// `nutriments` sigue siendo candidata a mergearse si una corrida posterior
// trae `--enrich` (Claude puede completar lo que faltaba). Sin `--enrich` no
// tiene sentido reintentarla (el resultado va a ser idéntico), así que el
// caller lo controla explícitamente con `includeDiscarded`.
function statusesFor(includeDiscarded: boolean): string[] {
  return includeDiscarded ? ['pending', 'discarded_incomplete'] : ['pending'];
}

/** Barcodes distintos con al menos una fila `pending` (o `discarded_incomplete`
 * si `includeDiscarded`), hasta `limit`. */
export async function fetchPendingBarcodes(limit: number, includeDiscarded = false): Promise<string[]> {
  const { data, error } = await admin()
    .from('products_staging')
    .select('barcode')
    .in('merge_status', statusesFor(includeDiscarded))
    .not('barcode', 'is', null)
    .limit(limit * 5); // sobre-pedimos: puede haber varias filas por barcode

  if (error || !data) {
    console.error('[staging] fetchPendingBarcodes error:', error?.message);
    return [];
  }
  const unique = [...new Set((data as { barcode: string }[]).map((r) => r.barcode))];
  return unique.slice(0, limit);
}

/** Filas `pending` (o `discarded_incomplete` si `includeDiscarded`) de un
 * barcode dado — son las que DISPARAN un pase de merge en esta corrida y las
 * que el caller debe marcar (merged/enriched/discarded_incomplete) al
 * terminar. NO uses esto para construir el merge en sí — ver
 * `fetchAllRowsForBarcode`. */
export async function fetchPendingRowsForBarcode(
  barcode: string,
  includeDiscarded = false,
): Promise<PendingStagingRow[]> {
  const { data, error } = await admin()
    .from('products_staging')
    .select('id, source, raw_payload')
    .eq('barcode', barcode)
    .in('merge_status', statusesFor(includeDiscarded));

  if (error || !data) {
    console.error(`[staging] fetchPendingRowsForBarcode(${barcode}) error:`, error?.message);
    return [];
  }
  return (data as { id: string; source: string; raw_payload: RawOFFProduct }[]).map((r) => ({
    id: r.id,
    source: r.source,
    raw: r.raw_payload,
  }));
}

/**
 * TODAS las filas de un barcode dado, sin importar `merge_status` — para
 * construir el resultado del merge en sí (mergeRawProducts). A propósito NO
 * filtra por estado: si una corrida anterior dejó una fila `merged` o
 * `discarded_incomplete` para este barcode, su data igual tiene que entrar
 * en la combinación de esta corrida.
 *
 * Por qué importa: si un retailer trajo un barcode que quedó
 * `discarded_incomplete` (sin ingredients/nutriments) y una corrida
 * POSTERIOR de OFF trae el mismo barcode completo, el merge de esa corrida
 * solo ve la fila `pending` de OFF (fetchPendingRowsForBarcode) y arma el
 * producto sin la data del retailer (ej. la imagen) — la fila del retailer
 * queda huérfana, sin `merged_into`. Peor: si más adelante corrés
 * `--enrich`, esa fila huérfana se vuelve a levantar SOLA (su hermana de OFF
 * ya está `merged`, excluida) y Claude le inventa datos que después
 * PISAN, vía upsert por barcode, el producto que ya tenía datos reales de
 * OFF. Usar `fetchAllRowsForBarcode` para el merge evita ambos problemas: el
 * resultado siempre es la combinación completa de todo lo que se scrapeó
 * alguna vez para ese barcode, y las filas viejas nunca se re-procesan solas.
 */
export async function fetchAllRowsForBarcode(barcode: string): Promise<PendingStagingRow[]> {
  const { data, error } = await admin()
    .from('products_staging')
    .select('id, source, raw_payload')
    .eq('barcode', barcode);

  if (error || !data) {
    console.error(`[staging] fetchAllRowsForBarcode(${barcode}) error:`, error?.message);
    return [];
  }
  return (data as { id: string; source: string; raw_payload: RawOFFProduct }[]).map((r) => ({
    id: r.id,
    source: r.source,
    raw: r.raw_payload,
  }));
}

/** Marca el resultado del merge sobre las filas de staging que contribuyeron. */
export async function markStagingRows(
  ids: string[],
  status: 'merged' | 'enriched' | 'discarded_incomplete',
  opts: { mergedInto?: string; discardReason?: string } = {},
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin()
    .from('products_staging')
    .update({
      merge_status: status,
      merged_at: new Date().toISOString(),
      merged_into: opts.mergedInto ?? null,
      discard_reason: opts.discardReason ?? null,
    })
    .in('id', ids);

  if (error) console.error('[staging] markStagingRows error:', error.message);
}
