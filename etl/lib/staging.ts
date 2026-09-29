// Lectura/escritura de `products_staging` (supabase/migrations/legacy/009_products_staging.sql).
// Ningún adapter ni job escribe directo a `products` — todo pasa por acá primero.
import { admin } from './supabaseAdmin';
import type { RawProduct } from '../../src/modules/catalog';

export type StagingInsert = {
  source: string;
  barcode: string | null;
  raw: RawProduct;
  runId: string;
};

const BATCH_SIZE = 500;

// Tope de filas por request de PostgREST: pasarlo trunca la respuesta EN SILENCIO. Toda
// lectura que pueda superar 1000 filas pagina (paginateRows).
const PAGE_SIZE = 1000;

/** Pagina con `.range()` hasta agotar las filas o hasta que `onPage` devuelva false.
 *  `buildQuery` tiene que devolver la misma query con un `.order()` estable: sin orden,
 *  la paginación puede repetir o saltear filas. */
async function paginateRows<T>(
  label: string,
  buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  onPage: (rows: T[]) => boolean,
): Promise<void> {
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error || !data) {
      console.error(`[staging] ${label} error:`, error?.message);
      return;
    }
    const rows = data as T[];
    if (!onPage(rows)) return;
    if (rows.length < PAGE_SIZE) return;
    from += PAGE_SIZE;
  }
}

/** Inserta filas crudas en products_staging en lotes de BATCH_SIZE. */
/** Filas que no llegaron a staging por lotes fallidos, para que el resumen final no diga
 *  que salió todo bien. */
let droppedRows = 0;
let failedBatches = 0;

/** Cuántas filas se perdieron por errores de insert desde que arrancó el
 *  proceso. Los jobs lo imprimen en su resumen final. */
export function stagingLosses(): { rows: number; batches: number } {
  return { rows: droppedRows, batches: failedBatches };
}

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
      // Un lote fallido no aborta la ingesta —perder 500 filas es mejor que
      // perder la corrida entera—, pero tiene que quedar contabilizado.
      failedBatches++;
      droppedRows += batch.length;
      console.error(`[staging] insert batch error (offset ${i}, ${batch.length} filas perdidas):`, error.message);
      continue;
    }
    inserted += count ?? batch.length;
  }
  return inserted;
}

// `discarded_incomplete` es reintentable: sin ingredientes el producto ya entra como
// `merged_incomplete`. El caller lo pide con `includeDiscarded`.
function statusesFor(includeDiscarded: boolean): string[] {
  return includeDiscarded ? ['pending', 'discarded_incomplete'] : ['pending'];
}

/** Barcodes distintos con filas `pending` (o `discarded_incomplete` si se pide), hasta
 *  `limit`. Pagina: hay varias filas por barcode y `.limit()` lo recorta PostgREST. */
export async function fetchPendingBarcodes(limit: number, includeDiscarded = false): Promise<string[]> {
  const unique = new Set<string>();

  await paginateRows<{ barcode: string }>(
    'fetchPendingBarcodes',
    (from, to) =>
      admin()
        .from('products_staging')
        .select('barcode')
        .in('merge_status', statusesFor(includeDiscarded))
        .not('barcode', 'is', null)
        .order('id')
        .range(from, to),
    (rows) => {
      for (const r of rows) {
        unique.add(r.barcode);
        if (unique.size >= limit) return false; // ya tenemos los que pidieron
      }
      return true;
    },
  );

  return [...unique];
}

export type StagingRowFull = {
  id: string;
  barcode: string;
  source: string;
  merge_status: string;
  run_id: string;
  raw: RawProduct;
};

/** Todas las filas (cualquier estado) de un lote de barcodes. Traer solo `pending` dejaría
 *  filas huérfanas sin `merged_into` y, con --enrich, Claude las re-levantaría pisando datos
 *  reales. */
export async function fetchRowsForBarcodes(barcodes: string[]): Promise<Map<string, StagingRowFull[]>> {
  const byBarcode = new Map<string, StagingRowFull[]>();
  if (barcodes.length === 0) return byBarcode;

  // Pagina: un lote toca varias filas por barcode, bastante más que las 1000 por request.
  // Sin paginar, la cola del lote volvía vacía y quedaba sin procesar sin ningún error.
  await paginateRows<StagingRowFull & { raw_payload: RawProduct }>(
    'fetchRowsForBarcodes',
    (from, to) =>
      admin()
        .from('products_staging')
        .select('id, barcode, source, merge_status, run_id, raw_payload')
        .in('barcode', barcodes)
        .order('id')
        .range(from, to),
    (rows) => {
      for (const row of rows) {
        const list = byBarcode.get(row.barcode) ?? [];
        list.push({
          id: row.id, barcode: row.barcode, source: row.source,
          merge_status: row.merge_status, run_id: row.run_id, raw: row.raw_payload,
        });
        byBarcode.set(row.barcode, list);
      }
      return true;
    },
  );
  return byBarcode;
}

/** Marca muchas filas de una con estado y `merged_into` propios: upsert por clave primaria
 *  (PostgREST no tiene UPDATE masivo). Exige reenviar las columnas NOT NULL. */
export async function markStagingRowsBulk(
  rows: {
    row: StagingRowFull;
    status: 'merged' | 'merged_incomplete' | 'enriched' | 'discarded_incomplete';
    mergedInto?: string;
  }[],
): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date().toISOString();

  const payload = rows.map(({ row, status, mergedInto }) => ({
    id: row.id,
    source: row.source,
    barcode: row.barcode,
    raw_payload: row.raw,
    run_id: row.run_id,
    merge_status: status,
    merged_at: now,
    merged_into: mergedInto ?? null,
  }));

  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    const { error } = await admin()
      .from('products_staging')
      .upsert(payload.slice(i, i + BATCH_SIZE), { onConflict: 'id' });
    if (error) console.error('[staging] markStagingRowsBulk error:', error.message);
  }
}

export type StagingStatusRow = { source: string; merge_status: string };

/** (fuente, estado) de cada fila de staging, para `etl:stats`. Si staging llega a millones,
 *  conviene una vista con `group by`. */
export async function fetchStagingStatusRows(): Promise<StagingStatusRow[]> {
  const all: StagingStatusRow[] = [];

  await paginateRows<StagingStatusRow>(
    'fetchStagingStatusRows',
    (from, to) =>
      admin().from('products_staging').select('source, merge_status').order('id').range(from, to),
    (rows) => {
      all.push(...rows);
      return true;
    },
  );

  return all;
}
