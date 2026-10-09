// Uso: npm run etl:audit-quality -- [--input export.jsonl] [--out marcas.jsonl]
// Auditoría de `products`, solo lectura: ingredientes con pinta de boilerplate, marca vacía
// embebida en el nombre y nutrientes fuera de rango. Reporta para revisión; no corrige.
// Con --out deja una fila por producto con sus marcas (y `<out>.resumen.json` con los conteos);
// con --input audita un export de `etl:export-products` en vez de leer la base.
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { auditProduct, summarizeAudit, type AuditRecord } from '../lib/auditRow';
import { forEachProductPage, readJsonl, sha256OfFile } from '../lib/productsExport';
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
  data_source: string | null;
  ai_enriched: boolean | null;
  ingredients_text: string | null;
  nutriments: Record<string, unknown> | null;
};

const COLUMNS = 'id, barcode, product_name, brand, data_source, ai_enriched, ingredients_text, nutriments';

async function fetchAllProducts(input?: string): Promise<ProductRow[]> {
  const all: ProductRow[] = [];
  if (input) {
    for await (const row of readJsonl(input)) all.push(row as unknown as ProductRow);
  } else {
    await forEachProductPage(COLUMNS, (rows) => {
      all.push(...(rows as unknown as ProductRow[]));
    });
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

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function writeMarks(products: ProductRow[], out: string, input?: string): Promise<void> {
  const records: AuditRecord[] = [];
  const stream = createWriteStream(out, { flags: 'wx' });
  for (const p of products) {
    const record = auditProduct(p);
    records.push(record);
    if (!stream.write(`${JSON.stringify(record)}\n`)) await once(stream, 'drain');
  }
  stream.end();
  await once(stream, 'finish');
  const summary = {
    generado: new Date().toISOString(),
    origen: input ? { archivo: input, sha256: await sha256OfFile(input) } : 'base (lectura directa)',
    conteos: summarizeAudit(records),
  };
  await writeFile(`${out}.resumen.json`, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
  console.log(`[auditDataQuality] marcas por producto -> ${out} (${records.length} filas)`);
}

async function main() {
  const input = argValue('--input');
  const out = argValue('--out');
  const products = await fetchAllProducts(input);
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

  if (out) await writeMarks(products, out, input);

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
