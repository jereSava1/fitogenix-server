// Uso: npm run etl:audit-quality
// Auditoría de `products`, solo lectura: ingredientes con pinta de boilerplate, marca vacía
// embebida en el nombre y nutrientes fuera de rango. Reporta para revisión; no corrige.
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { admin } from '../lib/supabaseAdmin';
import {
  checkIngredientsText,
  findBrandInName,
  findImplausibleNutrients,
  findIngredientsTextIssues,
  findNutrientInconsistencies,
} from '../lib/qualityHeuristics';

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

  // Diccionario de marcas desde la propia tabla. `brand` también tiene basura: se exigen
  // al menos 2 apariciones para bajar los falsos positivos.
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
  const textIssues: Finding[] = [];
  const inconsistentNutrients: Finding[] = [];

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

    const issues = findIngredientsTextIssues(p.ingredients_text);
    if (issues.length > 0) {
      textIssues.push({
        id: p.id,
        barcode: p.barcode,
        detail: [...new Set(issues.map((i) => `${i.rule} (${i.kind})`))].join(', '),
      });
    }

    const inconsistent = findNutrientInconsistencies(p.nutriments);
    if (inconsistent.length > 0) {
      inconsistentNutrients.push({
        id: p.id,
        barcode: p.barcode,
        detail: inconsistent.map((i) => i.rule).join(', '),
      });
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
  printSample('4. ingredients_text con texto que no es ingrediente o mal formado', textIssues);
  printSample('5. relaciones imposibles entre nutrientes', inconsistentNutrients);

  const total =
    boilerplateIngredients.length +
    missingBrandCandidates.length +
    implausibleNutrients.length +
    textIssues.length +
    inconsistentNutrients.length;
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
