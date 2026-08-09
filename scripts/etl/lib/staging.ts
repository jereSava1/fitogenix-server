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

// Tope de filas que PostgREST devuelve por request (`max-rows` de Supabase,
// 1000 por default). NO es un error cuando se supera: la respuesta viene
// truncada en silencio. Cualquier lectura que pueda tocar más de 1000 filas
// tiene que paginar con `.range()` — ver paginateRows.
const PAGE_SIZE = 1000;

/**
 * Recorre una query paginando con `.range()` hasta agotar las filas (o hasta
 * que `onPage` diga basta), porque un `.select()` pelado se corta en PAGE_SIZE
 * sin avisar.
 *
 * `buildQuery(from, to)` tiene que devolver la MISMA query en cada llamada,
 * variando solo el rango, y con un `.order()` estable: sin orden explícito
 * Postgres no garantiza el mismo orden entre requests, y la paginación podría
 * repetir o saltear filas.
 *
 * `onPage` devuelve `false` para cortar antes de tiempo (ya juntamos lo que
 * necesitábamos y no tiene sentido seguir trayendo páginas).
 */
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
/**
 * Filas que NO llegaron a staging por lotes fallidos, acumuladas durante toda
 * la corrida. Existe porque un fallo de lote solo se logueaba y se seguía de
 * largo: una ingesta podía perder 500 filas de 3000 y el resumen final igual
 * decía que había salido todo bien. Con los logs pasando por un pipe, la
 * pérdida quedaba invisible.
 */
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

/**
 * Barcodes distintos con al menos una fila `pending` (o `discarded_incomplete`
 * si `includeDiscarded`), hasta `limit`.
 *
 * Pagina de a PAGE_SIZE: como puede haber varias filas por barcode, para
 * juntar `limit` barcodes distintos hay que leer bastante más que `limit`
 * filas. Un `.limit(limit * 5)` no alcanza — PostgREST lo recorta a PAGE_SIZE
 * igual, así que con `--merge-limit` > ~1000 el merge procesaba muchísimo
 * menos de lo pedido, en silencio.
 */
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

export type StagingStatusRow = { source: string; merge_status: string };

/**
 * Todas las filas de staging reducidas a (fuente, estado) — para los conteos
 * de `etl:stats`. Pagina, porque el `.select()` pelado que había antes hacía
 * que stats reportara siempre un máximo de 1000 filas.
 *
 * Trae una fila por registro de staging: alcanza de sobra para el volumen de
 * validación (decenas de miles), pero si staging llega a millones conviene
 * moverlo a una vista con `group by` en Postgres en vez de contar en memoria.
 */
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
  // 'merged_incomplete' (migración 010): llegó a `products` pero sin datos
  // para puntuar. Distinto de 'discarded_incomplete', que era "no se escribió".
  status: 'merged' | 'merged_incomplete' | 'enriched' | 'discarded_incomplete',
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
