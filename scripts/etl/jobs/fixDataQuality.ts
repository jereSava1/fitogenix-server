// Uso: npm run etl:fix-quality -- [--limit 200] [--apply]
//
// Corrige (o, sin --apply, solo PROPONE) los hallazgos de etl:audit-quality:
//
//   - brand vacío con marca embebida en product_name: primero intenta el
//     diccionario de marcas conocidas de la propia tabla (determinístico,
//     gratis, exige >=2 apariciones para filtrar ruido — ver
//     lib/qualityHeuristics.ts). Si no matchea ahí (marca nunca vista antes,
//     típico de un producto con un solo SKU en la tabla), le pide a Claude
//     que la EXTRAIGA del texto del nombre — nunca que la invente.
//
//   - ingredients_text con pinta de boilerplate/dirección: le pide a Claude
//     que separe, del mismo texto, la porción real de ingredientes de la de
//     fabricante/dirección/RNE-RNPA. La porción real de ingredientes queda
//     en ingredients_text; la de fabricante se MUEVE a
//     `manufacturer_info` (requiere migrations/010_manufacturer_info.sql
//     aplicada) en vez de perderse. Si no hay nada rescatable, se anula
//     ingredients_text — la fila vuelve a pasar por el gate de completitud +
//     runMerge.ts que ya existe, en vez de quedar con un dato inventado.
//
// Por default es DRY RUN: imprime lo que HARÍA, no escribe nada — ni
// siquiera en dry-run se ahorran las llamadas a Claude (hacen falta para
// saber qué proponer), así que el costo en tokens es el mismo con o sin
// --apply. Es barato de todos modos (~$0.001-0.002 por fila tocada).
//
// Nunca corras --apply sin haber revisado antes el resultado del dry-run.
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { admin } from '../lib/supabaseAdmin';
import { checkIngredientsText, findBrandInName } from '../lib/qualityHeuristics';
import { classifyAndExtractIngredients, extractBrandFromName } from '../lib/qualityAI';

function parseArgs() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  return {
    limit: limitIdx >= 0 ? Number(args[limitIdx + 1]) : 200,
    apply: args.includes('--apply'),
  };
}

type ProductRow = {
  id: string;
  barcode: string | null;
  product_name: string | null;
  brand: string | null;
  ingredients_text: string | null;
};

async function fetchAllProducts(): Promise<ProductRow[]> {
  const client = admin();
  const pageSize = 1000;
  let from = 0;
  const all: ProductRow[] = [];

  for (;;) {
    const { data, error } = await client
      .from('products')
      .select('id, barcode, product_name, brand, ingredients_text')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[fixDataQuality] error leyendo products:', error.message);
      break;
    }
    const rows = (data ?? []) as ProductRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function main() {
  const { limit, apply } = parseArgs();
  console.log(
    `[fixDataQuality] limit=${limit} modo=${apply ? 'APLICA CAMBIOS' : 'dry-run (no escribe nada, pero SÍ llama a Claude para proponer)'}`,
  );

  const products = await fetchAllProducts();
  console.log(`[fixDataQuality] ${products.length} productos en la tabla`);

  // Mismo diccionario con filtro de frecuencia que audit-quality — nunca
  // deben divergir los dos jobs en qué cuenta como "marca conocida".
  const MIN_BRAND_OCCURRENCES = 2;
  const brandCounts = new Map<string, number>();
  for (const p of products) {
    const b = p.brand?.trim();
    if (b) brandCounts.set(b, (brandCounts.get(b) ?? 0) + 1);
  }
  const knownBrands = [...brandCounts.entries()]
    .filter(([, count]) => count >= MIN_BRAND_OCCURRENCES)
    .map(([brand]) => brand);

  let processed = 0;
  let brandFixedDict = 0;
  let brandFixedAi = 0;
  let ingredientsExtracted = 0;
  let ingredientsNulled = 0;

  for (const p of products) {
    if (processed >= limit) break;
    let touched = false;
    const updates: Record<string, unknown> = {};

    // --- Brand ---
    if (!p.brand?.trim() && p.product_name) {
      const dictMatch = findBrandInName(p.product_name, knownBrands);
      if (dictMatch) {
        console.log(`[brand/diccionario] ${p.barcode ?? p.id}: "${p.product_name}" → "${dictMatch}"`);
        updates.brand = dictMatch;
        brandFixedDict++;
        touched = true;
      } else {
        const aiMatch = await extractBrandFromName(p.product_name);
        if (aiMatch) {
          console.log(`[brand/IA] ${p.barcode ?? p.id}: "${p.product_name}" → "${aiMatch}"`);
          updates.brand = aiMatch;
          brandFixedAi++;
          touched = true;
        }
      }
    }

    // --- Ingredients ---
    const ingCheck = checkIngredientsText(p.ingredients_text);
    if (ingCheck.suspect && p.ingredients_text) {
      const extraction = await classifyAndExtractIngredients(p.ingredients_text);
      if (extraction.realIngredients) {
        console.log(
          `[ingredients/extraído] ${p.barcode ?? p.id}: "${extraction.realIngredients.slice(0, 60)}${extraction.realIngredients.length > 60 ? '...' : ''}"${extraction.manufacturerInfo ? ' (+ manufacturer_info)' : ''}`,
        );
        updates.ingredients_text = extraction.realIngredients;
        if (extraction.manufacturerInfo) updates.manufacturer_info = extraction.manufacturerInfo;
        ingredientsExtracted++;
      } else {
        console.log(
          `[ingredients/anulado] ${p.barcode ?? p.id}: nada rescatable — vuelve al gate de completitud${extraction.manufacturerInfo ? ' (se guarda manufacturer_info igual)' : ''}`,
        );
        updates.ingredients_text = null;
        if (extraction.manufacturerInfo) updates.manufacturer_info = extraction.manufacturerInfo;
        ingredientsNulled++;
      }
      touched = true;
    }

    if (touched) {
      processed++;
      if (apply) {
        const { error } = await admin().from('products').update(updates).eq('id', p.id);
        if (error) console.error(`  [fixDataQuality] error al aplicar en ${p.barcode ?? p.id}:`, error.message);
      }
    }
  }

  console.log(
    `\n[fixDataQuality] listo. brand: ${brandFixedDict} por diccionario + ${brandFixedAi} por IA. ingredients: ${ingredientsExtracted} extraídos, ${ingredientsNulled} anulados.`,
  );
  if (!apply) {
    console.log('[fixDataQuality] DRY RUN — nada se escribió en products. Revisá el log y volvé a correr con --apply si está bien.');
  } else {
    console.log(
      '[fixDataQuality] siguiente paso: npm run etl:merge -- --limit N   (reprocesa las filas que quedaron con ingredients_text anulado)',
    );
  }
}

main().catch((err) => {
  console.error('[fixDataQuality] error fatal:', err);
  process.exit(1);
});
