// Uso: npm run etl:off-images [-- --limit 2000] [--apply]
//
// Trae la imagen de los productos que no tienen, consultando la API de Open
// Food Facts por código de barras.
//
// Por qué hace falta un job aparte: el DUMP de OFF no incluye las imágenes
// —medido, 0 de 520 filas de staging traen `image_url`— pero la API sí las
// tiene. Como la URL lleva un número de revisión que no se puede derivar del
// barcode, hay que preguntarle a la API producto por producto.
//
// Es la mayor ganancia individual del plan de completitud: la imagen es el
// campo más incompleto del catálogo y OFF es el origen de la mayoría de los
// productos que no la tienen.
//
// No compite con la ingesta de retailers: pega a otro host. Y es seguro
// correrlo en paralelo al merge desde que la fila existente de `products`
// participa del merge — antes, la siguiente corrida borraba estas imágenes.
//
// DRY-RUN por defecto. No usa IA: la imagen es la que OFF tiene publicada
// para ese producto.
import 'dotenv/config';
import { admin } from '../lib/supabaseAdmin';

const UA = { 'User-Agent': 'Fitogenix/0.1 (contacto: soporte@fitogenix.com)' };
const PAGE_SIZE = 1000;

// OFF pide no pasar de ~100 req/min en la API de producto. 700ms deja margen
// y la corrida igual termina en un par de horas para todo el catálogo.
const RATE_LIMIT_MS = 700;

type Row = { barcode: string | null; product_name: string | null; data_source: string | null };

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--limit');
  return {
    limit: i >= 0 ? Number(args[i + 1]) : 2000,
    apply: args.includes('--apply'),
  };
}

/**
 * Imagen frontal del producto en OFF. Se prefiere `image_front_url` sobre
 * `image_url`: la primera es la foto del frente del envase, que es la que
 * sirve para reconocer el producto; `image_url` puede ser cualquiera de las
 * caras, incluida la tabla nutricional.
 */
async function fetchOffImage(barcode: string): Promise<string | null> {
  const url =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
    `?fields=image_front_url,image_url`;
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return null;
    const json = (await res.json()) as { product?: { image_front_url?: string; image_url?: string } };
    const img = json.product?.image_front_url ?? json.product?.image_url ?? null;
    return img && /^https?:\/\//i.test(img) ? img : null;
  } catch {
    return null;
  }
}

async function fetchCandidates(limit: number): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; rows.length < limit; from += PAGE_SIZE) {
    const { data, error } = await admin()
      .from('products')
      .select('barcode, product_name, data_source')
      .is('image_url', null)
      .not('barcode', 'is', null)
      .order('barcode')
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error('[off-images] error leyendo products:', error.message);
      break;
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.slice(0, limit);
}

async function main() {
  const { limit, apply } = parseArgs();
  console.log(`[off-images] limit=${limit} modo=${apply ? 'APLICAR' : 'dry-run (no escribe)'}`);

  const candidatos = await fetchCandidates(limit);
  console.log(`[off-images] ${candidatos.length} productos sin imagen\n`);

  let encontradas = 0, escritas = 0, fallos = 0;

  for (const [i, p] of candidatos.entries()) {
    const img = await fetchOffImage(p.barcode!);
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    if (!img) continue;
    encontradas++;

    if (!apply) {
      if (encontradas <= 8) console.log(`   [dry-run] ${p.barcode} ${String(p.product_name).slice(0, 34)}`);
      continue;
    }

    // Update, no upsert: se toca UN campo. Un upsert reenviaría el resto de
    // las columnas y volvería a introducir el riesgo de pisar datos que este
    // job no conoce.
    const { error } = await admin()
      .from('products')
      .update({ image_url: img, updated_at: new Date().toISOString() })
      .eq('barcode', p.barcode!);

    if (error) {
      fallos++;
      console.error(`[off-images] update falló para ${p.barcode}:`, error.message);
      continue;
    }
    escritas++;
    if (escritas % 100 === 0) {
      console.log(`[off-images] ${i + 1}/${candidatos.length} revisados · ${escritas} imágenes escritas`);
    }
  }

  const pct = (n: number) => `${Math.round((n / Math.max(1, candidatos.length)) * 100)}%`;
  console.log(`\n[off-images] listo.`);
  console.log(`  revisados:  ${candidatos.length}`);
  console.log(`  con imagen en OFF: ${encontradas} (${pct(encontradas)})`);
  console.log(`  ${apply ? 'escritas' : 'se escribirían'}: ${apply ? escritas : encontradas}${fallos ? ` · fallos: ${fallos}` : ''}`);
  if (!apply) console.log('\n  Correr de nuevo con --apply para escribir.');
}

main().catch((err) => {
  console.error('[off-images] error fatal:', err);
  process.exit(1);
});
