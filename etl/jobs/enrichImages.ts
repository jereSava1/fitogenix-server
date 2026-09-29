// Uso: npm run etl:images [-- --limit 2000] [--apply] [--upgrade]
// Mejor imagen por producto: la del retailer si está en staging (gratis y mejor), si no la
// de la API de OFF (el dump no las trae). --upgrade reemplaza las de OFF. Dry-run por defecto.
import 'dotenv/config';
import { admin } from '../lib/supabaseAdmin';

const UA = { 'User-Agent': 'Fitogenix/0.1 (contacto: soporte@fitogenix.com)' };
const PAGE_SIZE = 1000;

// OFF pide no pasar de ~100 req/min en la API de producto. 700ms deja margen
// y la corrida igual termina en un par de horas para todo el catálogo.
const RATE_LIMIT_MS = 700;

type Row = { barcode: string | null; product_name: string | null; image_url: string | null };

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--limit');
  return {
    limit: i >= 0 ? Number(args[i + 1]) : 2000,
    apply: args.includes('--apply'),
    upgrade: args.includes('--upgrade'),
    // Los EAN argentinos primero: son los que pueden tener imagen de retailer
    // y los que un usuario de acá va a escanear. Sin esto la corrida arranca
    // por los "00…" estadounidenses, que solo pueden resolverse contra OFF.
    prefix: args.includes('--all-prefixes') ? undefined : (() => { const i = args.indexOf('--prefix'); return i >= 0 ? args[i+1] : '779'; })(),
  };
}

const RETAILERS = new Set(['jumbo', 'disco', 'vea', 'carrefour']);

/** Imágenes de retailer que ya tenemos bajadas, por barcode. */
async function fetchRetailerImages(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin()
      .from('products_staging')
      .select('barcode, source, raw_payload')
      .in('source', [...RETAILERS])
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error('[images] error leyendo staging:', error.message);
      break;
    }
    const page = (data ?? []) as { barcode: string | null; raw_payload: { image_url?: string } }[];
    for (const r of page) {
      if (!r.barcode || out.has(r.barcode)) continue;
      const url = String(r.raw_payload?.image_url ?? '').trim();
      if (/^https?:\/\//i.test(url)) out.set(r.barcode, url);
    }
    if (page.length < PAGE_SIZE) break;
  }
  return out;
}

/** Imagen del frente en OFF: `image_front_url` antes que `image_url` (que puede ser otra cara). */
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

async function fetchCandidates(limit: number, upgrade: boolean, prefix?: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; rows.length < limit; from += PAGE_SIZE) {
    // Con --upgrade entran también los que YA tienen imagen, para poder
    // reemplazar una de OFF por una de retailer.
    let q = admin()
      .from('products')
      .select('barcode, product_name, image_url')
      .not('barcode', 'is', null);
    if (!upgrade) q = q.is('image_url', null);
    if (prefix) q = q.like('barcode', `${prefix}%`);
    const { data, error } = await q
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
  const { limit, apply, upgrade, prefix } = parseArgs();
  console.log(
    `[images] limit=${limit} prefijo=${prefix ?? 'todos'} modo=${apply ? 'APLICAR' : 'dry-run (no escribe)'}` +
      `${upgrade ? ' · --upgrade: también reemplaza imágenes de OFF por las de retailer' : ''}`,
  );

  const retailerImages = await fetchRetailerImages();
  console.log(`[images] ${retailerImages.size} imágenes de retailer disponibles en staging`);

  const candidatos = await fetchCandidates(limit, upgrade, prefix);
  console.log(`[images] ${candidatos.length} productos a revisar\n`);

  let deRetailer = 0, deOff = 0, escritas = 0, fallos = 0, consultasOff = 0;

  for (const [i, p] of candidatos.entries()) {
    const actual = String(p.image_url ?? '').trim();
    const delRetailer = retailerImages.get(String(p.barcode));

    let elegida: string | null = null;
    let origen = '';

    if (delRetailer && delRetailer !== actual) {
      // Gratis y mejor. Se aplica tanto si no había imagen como si la que
      // había venía de OFF.
      if (!actual || actual.includes('openfoodfacts.org')) {
        elegida = delRetailer;
        origen = 'retailer';
        deRetailer++;
      }
    } else if (!actual) {
      consultasOff++;
      const img = await fetchOffImage(p.barcode!);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      if (img) { elegida = img; origen = 'off'; deOff++; }
    }

    if (!elegida) continue;

    if (!apply) {
      if (escritas < 10) console.log(`   [dry-run] ${p.barcode} ${String(p.product_name).slice(0, 30).padEnd(30)} <- ${origen}`);
      escritas++;
      continue;
    }

    // Update de un solo campo, no upsert: un upsert reenviaría el resto de
    // las columnas y reintroduciría el riesgo de pisar datos que este job no
    // conoce.
    const { error } = await admin()
      .from('products')
      .update({ image_url: elegida, updated_at: new Date().toISOString() })
      .eq('barcode', p.barcode!);

    if (error) { fallos++; console.error(`[images] update falló para ${p.barcode}:`, error.message); continue; }
    escritas++;
    if (escritas % 200 === 0) console.log(`[images] ${i + 1}/${candidatos.length} revisados · ${escritas} escritas (${deRetailer} retailer, ${deOff} OFF)`);
  }

  console.log(`\n[images] listo.`);
  console.log(`  revisados:              ${candidatos.length}`);
  console.log(`  resueltos con retailer: ${deRetailer}  (gratis, sin request)`);
  console.log(`  resueltos con OFF:      ${deOff}  (de ${consultasOff} consultas)`);
  console.log(`  ${apply ? 'escritas' : 'se escribirían'}: ${escritas}${fallos ? ` · fallos: ${fallos}` : ''}`);
  if (!apply) console.log('\n  Correr de nuevo con --apply para escribir.');
}

main().catch((err) => {
  console.error('[off-images] error fatal:', err);
  process.exit(1);
});
