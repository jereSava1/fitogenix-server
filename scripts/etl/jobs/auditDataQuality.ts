// Uso: npm run etl:audit-quality
//
// Auditoría de calidad de `products` — SOLO LECTURA, no escribe nada. Junta
// candidatos por heurística (scripts/etl/lib/qualityHeuristics.ts) para tres
// patrones de corrupción conocidos:
//   1. ingredients_text con pinta de dirección/boilerplate legal en vez de
//      una lista de ingredientes real (típico de datos comunitarios de OFF).
//   2. brand vacío con la marca embebida en product_name (típico de scrapes
//      de retailer sin ese campo tageado).
//   3. nutrientes fuera de rango físico plausible (típico error de unidad,
//      mg en vez de g).
//
// Es el paso 1 (barato, determinístico, sin gastar un token de IA) del plan
// de auditoría de datos — ver fitogenix-agents/06-agente-etl-data.md. Reporta
// para revisión humana; la corrección (anular el campo y re-pasar la fila
// por el gate de completitud + merge existente) es un paso APARTE y
// deliberado, después de mirar la muestra acá. No se auto-aplica nada.
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { admin } from '../lib/supabaseAdmin';
import { checkIngredientsText, findBrandInName, findImplausibleNutrients } from '../lib/qualityHeuristics';

type ProductRow = {
  id: string;
  barcode: string | null;
  product_name: string | null;
  brand: string | null;
  ingredients_text: string | null;
  nutriments: Record<string, unknown> | null;
};

async function fetchAllProducts(): Promise<ProductRow[]> {
  const client = admin();
  const pageSize = 1000;
  let from = 0;
  const all: ProductRow[] = [];

  for (;;) {
    const { data, error } = await client
      .from('products')
      .select('id, barcode, product_name, brand, ingredients_text, nutriments')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[auditDataQuality] error leyendo products:', error.message);
      break;
    }
    const rows = (data ?? []) as ProductRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

type Finding = { id: string; barcode: string | null; detail: string };

function printSample(title: string, items: Finding[], limit = 10): void {
  console.log(`\n=== ${title} (${items.length} encontrados) ===`);
  if (items.length === 0) {
    console.log('  OK — ninguno.');
    return;
  }
  for (const item of items.slice(0, limit)) {
    console.log(`  ${item.barcode ?? item.id}: ${item.detail}`);
  }
  if (items.length > limit) console.log(`  ... y ${items.length - limit} más (no impreso acá).`);
}

async function main() {
  const products = await fetchAllProducts();
  console.log(`[auditDataQuality] ${products.length} productos escaneados`);

  // Diccionario de marcas conocidas construido desde la propia tabla — no
  // hace falta una lista externa. OJO: la columna `brand` tiene sus propios
  // datos corruptos (es justo lo que estamos auditando), así que un valor
  // que aparece UNA sola vez puede ser basura (ej. "Vainilla" — un sabor,
  // no una marca, que quedó cargado mal en alguna fila) y contaminar el
  // diccionario con falsos positivos. Exigir >=2 apariciones DISTINTAS no
  // elimina el riesgo del todo, pero baja mucho el ruido sin costo.
  const MIN_BRAND_OCCURRENCES = 2;
  const brandCounts = new Map<string, number>();
  for (const p of products) {
    const b = p.brand?.trim();
    if (b) brandCounts.set(b, (brandCounts.get(b) ?? 0) + 1);
  }
  const knownBrands = [...brandCounts.entries()]
    .filter(([, count]) => count >= MIN_BRAND_OCCURRENCES)
    .map(([brand]) => brand);

  const boilerplateIngredients: Finding[] = [];
  const missingBrandCandidates: Finding[] = [];
  const implausibleNutrients: Finding[] = [];

  for (const p of products) {
    const ingCheck = checkIngredientsText(p.ingredients_text);
    if (ingCheck.suspect) {
      boilerplateIngredients.push({
        id: p.id,
        barcode: p.barcode,
        detail: `"${(p.ingredients_text ?? '').slice(0, 80)}${(p.ingredients_text ?? '').length > 80 ? '...' : ''}" — ${ingCheck.reasons.join('; ')}`,
      });
    }

    if (!p.brand || !p.brand.trim()) {
      const candidate = findBrandInName(p.product_name, knownBrands);
      if (candidate) {
        missingBrandCandidates.push({
          id: p.id,
          barcode: p.barcode,
          detail: `product_name="${p.product_name}" → candidato brand="${candidate}"`,
        });
      }
    }

    const badNutrients = findImplausibleNutrients(p.nutriments);
    if (badNutrients.length > 0) {
      implausibleNutrients.push({
        id: p.id,
        barcode: p.barcode,
        detail: badNutrients.map((n) => `${n.field}=${n.value}`).join(', '),
      });
    }
  }

  printSample('1. ingredients_text con pinta de dirección/boilerplate legal', boilerplateIngredients);
  printSample('2. brand vacío con marca candidata en product_name', missingBrandCandidates);
  printSample('3. nutrientes fuera de rango físico plausible', implausibleNutrients);

  const total =
    boilerplateIngredients.length + missingBrandCandidates.length + implausibleNutrients.length;
  console.log(
    `\n[auditDataQuality] listo. ${total} hallazgo(s) en total (una fila puede aparecer en más de una categoría). Solo lectura — no se tocó nada.`,
  );
  console.log(
    '[auditDataQuality] siguiente paso: revisar la muestra a mano. Recién después de confirmar que las heurísticas no traen falsos positivos en volumen, decidir cómo corregir cada categoría (ver README, sección Corrección).',
  );
}

main().catch((err) => {
  console.error('[auditDataQuality] error fatal:', err);
  process.exit(1);
});
