// Uso: npm run etl:export-products -- --out /ruta/products.jsonl [--table products_staging]
// Copia de seguridad de `products` (solo lectura): una fila por línea, con su SHA-256 al lado.
// Guardar fuera de cualquier repo. No sobrescribe un archivo existente.
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { writeFile } from 'node:fs/promises';
import { writeProductsJsonl } from '../lib/productsExport';

async function main() {
  const idx = process.argv.indexOf('--out');
  const out = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!out) throw new Error('Falta --out <archivo.jsonl>');

  const tIdx = process.argv.indexOf('--table');
  const table = tIdx >= 0 ? process.argv[tIdx + 1] : 'products';
  if (!['products', 'products_staging'].includes(table)) throw new Error('--table: products | products_staging');
  const { rows, sha256 } = await writeProductsJsonl(out, table);
  await writeFile(`${out}.sha256`, `${sha256}  ${out.split('/').pop()}\n`, { flag: 'wx' });
  console.log(`[exportProducts] ${rows} filas -> ${out}`);
  console.log(`[exportProducts] sha256 ${sha256}`);
}

main().catch((err) => {
  console.error('[exportProducts] error fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
