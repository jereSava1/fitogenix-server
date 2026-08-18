// Uso: npx tsx scripts/test-search-rpc.ts
//
// Smoke test manual (2026-08-18) para validar el RPC `search_products_by_name`
// (migración 014) y el pipeline de búsqueda por texto/barcode DESPUÉS de la
// migración a "solo catálogo propio" — no reemplaza a los unit tests
// (que mockean Supabase), esto pega contra la base REAL.
//
// No escribe en la base (solo lee). Corre 3 capas, de más cruda a más alta:
//   1. RPC crudo (admin().rpc('search_products_by_name', ...))
//   2. cacheService.findCachedProductByName (guard de longitud + reconstrucción)
//   3. productLookupService.lookupProduct (pipeline completo: Redis → Supabase → catálogo)
//
// Elige 2 productos REALES del catálogo (con barcode) para armar casos de
// match exacto/parcial/con acentos, más casos negativos (typo grosero, query
// corto, barcode inexistente) para confirmar el mensaje de "no está en el
// catálogo todavía".
import 'dotenv/config';
import { admin } from './etl/lib/supabaseAdmin';
import { findCachedProductByName, getCachedProductByBarcode } from '../src/services/cacheService';
import { lookupProduct } from '../src/services/productLookupService';

function section(title: string): void {
  console.log(`\n${'─'.repeat(60)}\n${title}\n${'─'.repeat(60)}`);
}

async function testRpcRaw(query: string): Promise<void> {
  const { data, error } = await admin().rpc('search_products_by_name', {
    search_query: query,
    match_limit: 5,
  });
  if (error) {
    console.log(`  RPC("${query}") → ERROR: ${error.message}`);
    return;
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  console.log(`  RPC("${query}") → ${rows.length} fila(s)`);
  rows.slice(0, 3).forEach((r, i) => {
    console.log(`    [${i}] ${r.product_name}  (barcode=${r.barcode ?? 'null'})`);
  });
}

async function testCacheService(query: string): Promise<void> {
  const result = await findCachedProductByName(query);
  console.log(
    `  findCachedProductByName("${query}") → ${
      result ? `${result.raw.product_name} (barcode=${result.barcode})` : 'null (miss)'
    }`,
  );
}

async function testLookup(query: string): Promise<void> {
  const result = await lookupProduct(query);
  console.log(
    `  lookupProduct("${query}") → ${
      result ? `${result.name} | score=${result.score} | dataSource=${result.dataSource}` : 'null (no está en catálogo)'
    }`,
  );
}

async function main(): Promise<void> {
  section('0. Eligiendo 2 productos reales del catálogo (con barcode e ingredients_text)');
  const { data: sampleRows, error: sampleError } = await admin()
    .from('products')
    .select('barcode, product_name')
    .not('barcode', 'is', null)
    .not('ingredients_text', 'is', null)
    .limit(2);

  if (sampleError || !sampleRows || sampleRows.length === 0) {
    console.error('No pude traer productos de muestra:', sampleError?.message ?? 'catálogo vacío');
    process.exit(1);
  }

  const samples = sampleRows as Array<{ barcode: string; product_name: string }>;
  samples.forEach((s, i) => console.log(`  Muestra ${i}: "${s.product_name}" (barcode=${s.barcode})`));

  const [p1] = samples;
  const fullName = p1.product_name;
  const firstWord = fullName.split(' ')[0];
  const withAccentsMangled = fullName.toUpperCase();

  section('1. RPC crudo — casos positivos');
  await testRpcRaw(fullName); // match exacto
  await testRpcRaw(firstWord); // match parcial (una palabra)
  await testRpcRaw(withAccentsMangled); // mayúsculas (el RPC no normaliza mayúsculas — ver nota abajo)

  section('2. RPC crudo — casos negativos');
  await testRpcRaw('xyzxyzxyz-producto-que-no-existe-123');
  await testRpcRaw('ab'); // el RPC en sí no aplica el guard de longitud — eso es responsabilidad de la capa de arriba

  section('3. cacheService.findCachedProductByName — guards + reconstrucción');
  await testCacheService(fullName);
  await testCacheService(firstWord);
  await testCacheService('a'); // < 3 chars normalizado → debe cortar ANTES de tocar la DB, sin llamar al RPC
  await testCacheService('xyzxyzxyz-producto-que-no-existe-123');

  section('4. productLookupService.lookupProduct — pipeline completo (texto)');
  await testLookup(fullName);
  await testLookup(firstWord.toLowerCase());
  await testLookup('xyzxyzxyz-producto-que-no-existe-123');

  section('5. productLookupService.lookupProduct — pipeline completo (barcode)');
  await testLookup(p1.barcode); // barcode real → hit
  await testLookup('00000000000'); // barcode inexistente (11 dígitos, pasa el regex) → miss

  section('6. getCachedProductByBarcode — control directo del barcode real');
  const direct = await getCachedProductByBarcode(p1.barcode);
  console.log(`  getCachedProductByBarcode("${p1.barcode}") → ${direct ? direct.raw.product_name : 'null'}`);

  section('Listo');
  console.log(
    'Revisá arriba: los casos positivos deben devolver el producto, los negativos deben dar null/0 filas,\n' +
      'y el query de 2 caracteres en la capa 3 NO debe haber generado ninguna llamada RPC visible en logs\n' +
      '(el guard de longitud vive en cacheService, no en el RPC).',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error en el smoke test:', err);
    process.exit(1);
  });
