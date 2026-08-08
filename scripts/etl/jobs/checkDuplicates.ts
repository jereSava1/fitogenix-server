// Uso: npm run etl:check-dupes
//
// Validación de "¿hay algún producto guardado dos veces?" — rerunnable,
// pensado para correr después de cada etl:merge grande (o cuando quieras).
// Solo lee `products`, no escribe nada.
//
// Tres chequeos, de más a menos "esto no debería pasar nunca":
//
//  1. Barcode exacto repetido — estructuralmente imposible (UNIQUE(barcode)
//     en la DB, migración 001). Se incluye igual como sanity check barato:
//     si esto alguna vez tira algo, hay un problema de infraestructura, no
//     de datos (constraint caída, RLS bypaseado raro, etc.).
//  2. Mismo barcode en dos formatos (EAN-13 = '0' + UPC-A de 12 dígitos) —
//     el caso que normalizeBarcode (scripts/etl/lib/barcode.ts) previene
//     desde 2026-08-06 para filas NUEVAS del ETL. Si aparece acá es data
//     vieja (pre-normalización) o algo que entró por el lookup en vivo
//     (que no normaliza — ver barcode.ts).
//  3. Mismo product_name + brand con barcodes distintos — señal más débil
//     (puede ser una presentación distinta legítima: 500g vs 1kg), pero
//     vale la pena mirar a mano cuando el volumen crece.
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { admin } from '../lib/supabaseAdmin';

type ProductRow = { id: string; barcode: string; product_name: string | null; brand: string | null };

async function fetchAllProductsWithBarcode(): Promise<ProductRow[]> {
  const client = admin();
  const pageSize = 1000;
  let from = 0;
  const all: ProductRow[] = [];

  for (;;) {
    const { data, error } = await client
      .from('products')
      .select('id, barcode, product_name, brand')
      .not('barcode', 'is', null)
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[checkDuplicates] error leyendo products:', error.message);
      break;
    }
    const rows = (data ?? []) as ProductRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

function normalizeNamePair(name: string | null, brand: string | null): string {
  return `${(name ?? '').trim().toLowerCase()}|${(brand ?? '').trim().toLowerCase()}`;
}

async function main() {
  const products = await fetchAllProductsWithBarcode();
  console.log(`[checkDuplicates] ${products.length} productos con barcode para revisar\n`);

  // 1. Barcode exacto repetido — no debería pasar nunca (UNIQUE constraint).
  const byBarcode = new Map<string, ProductRow[]>();
  for (const p of products) {
    const list = byBarcode.get(p.barcode) ?? [];
    list.push(p);
    byBarcode.set(p.barcode, list);
  }
  const exactDupes = [...byBarcode.entries()].filter(([, rows]) => rows.length > 1);

  console.log('=== 1. Barcode exacto repetido (no debería pasar — UNIQUE constraint) ===');
  if (exactDupes.length === 0) {
    console.log('  OK — ninguno.');
  } else {
    for (const [barcode, rows] of exactDupes) {
      console.log(`  ⚠ ${barcode}: ${rows.map((r) => r.id).join(', ')}`);
    }
  }

  // 2. EAN-13 = '0' + UPC-A(12) — mismo código real, dos formatos de texto.
  const barcodeSet = new Set(products.map((p) => p.barcode));
  const crossFormatDupes: { ean13: ProductRow; upca: ProductRow }[] = [];
  for (const p of products) {
    if (p.barcode.length === 13 && p.barcode.startsWith('0')) {
      const upcaCandidate = p.barcode.slice(1);
      const match = products.find((q) => q.barcode === upcaCandidate);
      if (match) crossFormatDupes.push({ ean13: p, upca: match });
    }
  }

  console.log('\n=== 2. Mismo código en EAN-13 y UPC-A (formato distinto, producto físico igual) ===');
  if (crossFormatDupes.length === 0) {
    console.log('  OK — ninguno.');
  } else {
    for (const { ean13, upca } of crossFormatDupes) {
      console.log(
        `  ⚠ EAN-13 ${ean13.barcode} (id=${ean13.id}) == UPC-A ${upca.barcode} (id=${upca.id}) — "${ean13.product_name}" / "${upca.product_name}"`,
      );
    }
  }

  // 3. Mismo nombre+marca, barcode distinto — señal débil, revisar a mano.
  const byNamePair = new Map<string, ProductRow[]>();
  for (const p of products) {
    if (!p.product_name) continue;
    const key = normalizeNamePair(p.product_name, p.brand);
    const list = byNamePair.get(key) ?? [];
    list.push(p);
    byNamePair.set(key, list);
  }
  const nameDupes = [...byNamePair.entries()].filter(([, rows]) => rows.length > 1);

  console.log('\n=== 3. Mismo product_name + brand, barcode distinto (revisar a mano) ===');
  if (nameDupes.length === 0) {
    console.log('  OK — ninguno.');
  } else {
    for (const [key, rows] of nameDupes) {
      console.log(`  ~ "${key}": ${rows.map((r) => `${r.barcode} (${r.id})`).join(' | ')}`);
    }
  }

  const totalFlags = exactDupes.length + crossFormatDupes.length + nameDupes.length;
  console.log(`\n[checkDuplicates] listo. ${totalFlags === 0 ? 'sin hallazgos' : `${totalFlags} hallazgo(s) para revisar`}.`);
}

main().catch((err) => {
  console.error('[checkDuplicates] error fatal:', err);
  process.exit(1);
});
