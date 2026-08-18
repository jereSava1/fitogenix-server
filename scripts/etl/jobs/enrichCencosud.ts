// Uso: npm run etl:enrich-cencosud [-- --limit 500] [--apply] [--only-missing-nutrition]
//
// Rellena ingredientes y tabla nutricional de los productos que ya tenemos,
// consultando Jumbo/Disco/Vea por código de barras (fq=alternateIds_Ean).
//
// Por qué esta fuente y no otra: Cencosud es el ÚNICO retailer argentino que
// publica `Ingredientes` y `Tabla Nutricional` en su API. Se verificó que
// Coto y La Anónima no son VTEX, y que Masonline lo es pero no expone esos
// campos. Open Food Facts ya está agotado para Argentina — de 13 productos
// sin marca consultados en vivo, 0 traían el dato.
//
// Medido sobre 40 productos argentinos incompletos del catálogo: 80% aparecen
// en Jumbo, 58% con ingredientes y 48% con tabla nutricional.
//
// DRY-RUN por defecto: sin --apply no escribe nada, solo informa qué haría.
// No usa IA: todo lo que escribe viene de la etiqueta publicada por el
// retailer. El enriquecimiento con Claude es un paso posterior y separado,
// para lo que quede sin resolver después de esto.
import 'dotenv/config';
import { admin } from '../lib/supabaseAdmin';
import { parseVtexIngredients, parseVtexNutrition, parseVtexSeals } from '../adapters/vtexAdapter';
import { mapRawToProduct } from '../../../src/services/productLookupService';
import { buildCachePayload } from '../../../src/services/cacheService';
import type { RawOFFProduct } from '../../../src/types/fitogenix';

const UA = { 'User-Agent': 'Fitogenix-ETL/0.1 (contacto: soporte@fitogenix.com)' };

// Orden de consulta: los tres son el mismo catálogo de Cencosud, pero no
// tienen exactamente el mismo surtido. Se corta en el primero que responda
// con datos útiles para no gastar tres requests por producto.
const DOMAINS = ['www.jumbo.com.ar', 'www.disco.com.ar', 'www.vea.com.ar'];

const PAGE_SIZE = 1000;
const RATE_LIMIT_MS = 400;

type Row = {
  id: string;
  barcode: string | null;
  product_name: string | null;
  brand: string | null;
  ingredients_text: string | null;
  nutriments: Record<string, unknown> | null;
  nova_group: number | null;
  additives_tags: string[] | null;
  category: string | null;
  image_url: string | null;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, def?: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  return {
    limit: Number(get('--limit', '500')),
    apply: args.includes('--apply'),
    // Por defecto solo productos con EAN argentino. Un supermercado de acá no
    // tiene el 00000996 de un producto estadounidense, y consultarlo es un
    // request tirado: la primera versión de este job ordenaba por barcode y
    // arrancaba justo por los "0…", dando 0% de aciertos donde a mano había
    // medido 80%.
    prefix: get('--prefix', '779'),
    allPrefixes: args.includes('--all-prefixes'),
  };
}

/** ¿Le falta a este producto algo que Cencosud pueda darnos? */
function needsEnrichment(r: Row): boolean {
  const sinIngredientes = String(r.ingredients_text ?? '').trim().length < 5;
  const sinNutrientes = !r.nutriments || Object.keys(r.nutriments).length === 0;
  return sinIngredientes || sinNutrientes;
}

async function askCencosud(ean: string): Promise<Record<string, unknown> | null> {
  for (const domain of DOMAINS) {
    try {
      const res = await fetch(
        `https://${domain}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${encodeURIComponent(ean)}`,
        { headers: UA },
      );
      if (!res.ok) continue;
      const list = (await res.json()) as unknown;
      if (!Array.isArray(list) || list.length === 0) continue;
      const product = list[0] as Record<string, unknown>;
      // Solo sirve si trae al menos uno de los dos campos que buscamos.
      if (product.Ingredientes || product['Tabla Nutricional']) return product;
    } catch (err) {
      console.error(`[enrich] ${domain} ${ean}:`, (err as Error).message);
    } finally {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }
  }
  return null;
}

async function fetchCandidates(limit: number, prefix: string | undefined): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; rows.length < limit; from += PAGE_SIZE) {
    let query = admin()
      .from('products')
      .select('id, barcode, product_name, brand, ingredients_text, nutriments, nova_group, additives_tags, category, image_url')
      .not('barcode', 'is', null);
    if (prefix) query = query.like('barcode', `${prefix}%`);
    const { data, error } = await query
      .order('barcode')
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error('[enrich] error leyendo products:', error.message);
      break;
    }
    const page = (data ?? []) as Row[];
    rows.push(...page.filter(needsEnrichment));
    if (page.length < PAGE_SIZE) break;
  }
  return rows.slice(0, limit);
}

async function main() {
  const { limit, apply, prefix, allPrefixes } = parseArgs();
  const activePrefix = allPrefixes ? undefined : prefix;
  console.log(
    `[enrich] limit=${limit} prefijo=${activePrefix ?? 'todos'} ` +
      `modo=${apply ? 'APLICAR (escribe en products)' : 'dry-run (no escribe)'}`,
  );

  const candidatos = await fetchCandidates(limit, activePrefix);
  console.log(`[enrich] ${candidatos.length} productos sin ingredientes o sin tabla nutricional\n`);

  let encontrados = 0, conIngredientes = 0, conNutrientes = 0, escritos = 0, fallos = 0;

  for (const [i, p] of candidatos.entries()) {
    const found = await askCencosud(p.barcode!);
    if (!found) continue;
    encontrados++;

    const ingredients = parseVtexIngredients(found.Ingredientes as string[] | undefined);
    const nutriments = parseVtexNutrition(found['Tabla Nutricional'] as string[] | undefined);
    const labels = parseVtexSeals(found.Sellos as string[] | undefined);
    if (ingredients) conIngredientes++;
    if (nutriments) conNutrientes++;

    // Los datos NUESTROS mandan cuando ya existen: esto llena huecos, no
    // pisa lo que ya teníamos de una fuente que pudo ser mejor.
    const merged: RawOFFProduct = {
      product_name: p.product_name ?? (found.productName as string | undefined),
      brands: p.brand ?? (found.brand as string | undefined),
      image_url: p.image_url ?? undefined,
      categories: p.category ?? undefined,
      ingredients_text: String(p.ingredients_text ?? '').trim().length >= 5
        ? p.ingredients_text!
        : ingredients,
      nutriments: p.nutriments && Object.keys(p.nutriments).length > 0 ? p.nutriments : nutriments,
      nova_group: p.nova_group ?? undefined,
      additives_tags: p.additives_tags ?? undefined,
      labels_tags: labels,
    };

    const gano = (!!ingredients && String(p.ingredients_text ?? '').trim().length < 5) ||
                 (!!nutriments && (!p.nutriments || Object.keys(p.nutriments).length === 0));
    if (!gano) continue;

    if (!apply) {
      if (escritos < 10) {
        console.log(`   [dry-run] ${p.barcode} ${String(p.product_name).slice(0, 34).padEnd(34)} ` +
          `${ingredients ? '+ingredientes' : ''} ${nutriments ? '+nutrientes' : ''}`);
      }
      escritos++;
      continue;
    }

    const product = mapRawToProduct(merged, p.barcode!);
    const payload = buildCachePayload(product, merged, { barcode: p.barcode! });
    const { error } = await admin().from('products').upsert(payload, { onConflict: 'barcode' });
    if (error) {
      fallos++;
      console.error(`[enrich] upsert falló para ${p.barcode}:`, error.message);
      continue;
    }
    escritos++;

    if (escritos % 50 === 0) {
      console.log(`[enrich] progreso: ${i + 1}/${candidatos.length} revisados · ${escritos} actualizados`);
    }
  }

  const pct = (n: number) => `${Math.round((n / Math.max(1, candidatos.length)) * 100)}%`;
  console.log(`\n[enrich] listo.`);
  console.log(`  revisados:            ${candidatos.length}`);
  console.log(`  encontrados en Cencosud: ${encontrados} (${pct(encontrados)})`);
  console.log(`  con ingredientes:     ${conIngredientes} (${pct(conIngredientes)})`);
  console.log(`  con tabla nutricional:${conNutrientes} (${pct(conNutrientes)})`);
  console.log(`  ${apply ? 'actualizados' : 'se actualizarían'}: ${escritos}${fallos ? ` · fallos: ${fallos}` : ''}`);
  if (!apply) console.log('\n  Correr de nuevo con --apply para escribir.');
}

main().catch((err) => {
  console.error('[enrich] error fatal:', err);
  process.exit(1);
});
