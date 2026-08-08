// Uso: npm run etl:off -- --file /ruta/al/products.jsonl[.gz] [--limit 1000]
//
// Streamea el dump de OFF (fs.createReadStream + readline, nunca todo en
// memoria), filtra LATAM/Argentina, adapta a RawOFFProduct, e inserta en
// products_staging en lotes. NUNCA escribe en `products` — eso lo hace
// runMerge.ts después. Ver 06-agente-etl-data.md, Fases 1 y 3.
//
// El dump completo no se descarga desde acá (es de varios GB) — bajalo antes
// con algo como:
//   curl -L -o off-products.jsonl.gz https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz
// y apuntá --file a ese archivo (acepta .jsonl o .jsonl.gz).
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { adaptOffLine, SUPPORTED_COUNTRY_TAGS } from '../adapters/offAdapter';
import { insertStagingRows, type StagingInsert } from '../lib/staging';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const limitArg = get('--limit');
  const countriesArg = get('--countries');
  return {
    file: get('--file'),
    limit: limitArg ? Number(limitArg) : undefined,
    // undefined = sin --countries → offAdapter usa su default (Argentina sola).
    countries: countriesArg ? countriesArg.split(',').map((c) => c.trim().toLowerCase()) : undefined,
  };
}

async function main() {
  const { file, limit, countries } = parseArgs();
  if (!file || !existsSync(file)) {
    console.error(
      'Uso: npm run etl:off -- --file <ruta al dump .jsonl o .jsonl.gz> [--limit N] [--countries argentina,chile,...]',
    );
    process.exit(1);
  }

  let countryTags: string[] | undefined;
  if (countries) {
    const unknown = countries.filter((c) => !(c in SUPPORTED_COUNTRY_TAGS));
    if (unknown.length > 0) {
      console.error(
        `[ingestOff] país(es) no soportado(s): ${unknown.join(', ')}. Soportados: ${Object.keys(SUPPORTED_COUNTRY_TAGS).join(', ')}`,
      );
      process.exit(1);
    }
    countryTags = countries.map((c) => SUPPORTED_COUNTRY_TAGS[c]);
  }

  const runId = `off-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  console.log(
    `[ingestOff] run_id=${runId} file=${file} limit=${limit ?? 'sin límite'} países=${countries?.join(',') ?? 'argentina (default)'}`,
  );

  const baseStream = createReadStream(file);
  const stream = file.endsWith('.gz') ? baseStream.pipe(createGunzip()) : baseStream;
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  const BATCH_SIZE = 500;
  let scanned = 0;
  let adapted = 0;
  let batch: StagingInsert[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const inserted = await insertStagingRows(batch);
    console.log(`[ingestOff] lote insertado: ${inserted}/${batch.length} (acumulado adaptado: ${adapted})`);
    batch = [];
  };

  for await (const line of rl) {
    scanned++;
    if (limit && adapted >= limit) break;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // línea corrupta — se saltea, no aborta el dump entero
    }

    const result = adaptOffLine(parsed as Parameters<typeof adaptOffLine>[0], countryTags);
    if (!result) continue;

    adapted++;
    batch.push({ source: 'off', barcode: result.barcode, raw: result.raw, runId });
    if (batch.length >= BATCH_SIZE) await flush();

    if (scanned % 100000 === 0) {
      console.log(`[ingestOff] progreso: ${scanned} líneas escaneadas, ${adapted} adaptadas`);
    }
  }
  await flush();

  console.log(`[ingestOff] listo. run_id=${runId} escaneadas=${scanned} adaptadas=${adapted}`);
  console.log('[ingestOff] siguiente paso: npm run etl:merge -- --limit 200   (validar subconjunto antes de escalar)');
}

main().catch((err) => {
  console.error('[ingestOff] error fatal:', err);
  process.exit(1);
});
