// Uso: npm run etl:vtex -- --domain www.carrefour.com.ar --source carrefour [--pages 5] [--pageSize 50]
//
// Pagina la API pública de catálogo VTEX (catalog_system/pub/products/search,
// sin auth) — confirmada en vivo contra Jumbo, Disco, Vea y Carrefour el
// 2026-08-06. Adapta cada producto a RawOFFProduct e inserta en
// products_staging. NUNCA escribe en `products`. Ver 06-agente-etl-data.md,
// Fases 3 y 5.
//
// Dominios ya confirmados VTEX: www.jumbo.com.ar, www.disco.com.ar,
// www.vea.com.ar, www.carrefour.com.ar. Antes de sumar un retailer nuevo,
// verificar que responde en ese mismo endpoint (si no, no es VTEX y necesita
// Crawlee en vez de este job — ver Fase 5 del documento del agente).
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { randomUUID } from 'node:crypto';
import { adaptVtexProduct } from '../adapters/vtexAdapter';
import { insertStagingRows, stagingLosses, type StagingInsert } from '../lib/staging';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, def?: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  return {
    domain: get('--domain'),
    source: get('--source'),
    pages: Number(get('--pages', '5')),
    pageSize: Number(get('--pageSize', '50')),
  };
}

async function fetchPage(domain: string, from: number, to: number): Promise<unknown[]> {
  const url = `https://${domain}/api/catalog_system/pub/products/search?_from=${from}&_to=${to}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Fitogenix-ETL/0.1 (contacto: soporte@fitogenix.com)' },
  });
  if (!res.ok) {
    console.error(`[ingestVtex] ${url} -> HTTP ${res.status}`);
    return [];
  }
  return (await res.json()) as unknown[];
}

async function main() {
  const { domain, source, pages, pageSize } = parseArgs();
  if (!domain || !source) {
    console.error(
      'Uso: npm run etl:vtex -- --domain <dominio, ej. www.carrefour.com.ar> --source <nombre-fuente, ej. carrefour> [--pages N] [--pageSize N]',
    );
    process.exit(1);
  }

  const runId = `${source}-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  console.log(`[ingestVtex] run_id=${runId} domain=${domain} source=${source} pages=${pages} pageSize=${pageSize}`);

  let adapted = 0;
  for (let page = 0; page < pages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const products = await fetchPage(domain, from, to);

    if (products.length === 0) {
      console.log(`[ingestVtex] página ${page} vacía — corto acá (fin de catálogo o bloqueo)`);
      break;
    }

    const batch: StagingInsert[] = [];
    for (const p of products) {
      const results = adaptVtexProduct(p as Parameters<typeof adaptVtexProduct>[0]);
      for (const r of results) {
        batch.push({ source, barcode: r.barcode, raw: r.raw, runId });
        adapted++;
      }
    }
    const inserted = await insertStagingRows(batch);
    console.log(
      `[ingestVtex] página ${page}: ${products.length} productos VTEX -> ${batch.length} SKUs válidos, ${inserted} insertados`,
    );

    // Rate limit conservador — nunca a la velocidad máxima que el servidor
    // técnicamente tolera. Ver 06-agente-etl-data.md, sección scrapers.
    await new Promise((r) => setTimeout(r, 500));
  }

  const losses = stagingLosses();
  console.log(`[ingestVtex] listo. run_id=${runId} adaptados=${adapted}`);
  if (losses.rows > 0) {
    console.error(
      `[ingestVtex] ATENCIÓN: ${losses.rows} filas se perdieron en ${losses.batches} lote(s) fallido(s). ` +
        'Lo adaptado NO es lo que quedó en staging — volver a correr para recuperarlas.',
    );
  }
  console.log('[ingestVtex] siguiente paso: npm run etl:merge -- --limit 200   (validar subconjunto antes de escalar)');
}

main().catch((err) => {
  console.error('[ingestVtex] error fatal:', err);
  process.exit(1);
});
