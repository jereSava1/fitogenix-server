// Lectura de `products` completa, por páginas ordenadas por id (keyset): sin saltos ni repetidos
// aunque la tabla cambie mientras se lee. Solo lectura.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { admin } from './supabaseAdmin';

const PAGE_SIZE = 1000;

/** Lee una tabla completa por páginas ordenadas por id (keyset). Solo lectura. */
export async function forEachTablePage(
  table: string,
  columns: string,
  onPage: (rows: Record<string, unknown>[]) => Promise<void> | void,
): Promise<void> {
  let lastId: string | null = null;
  for (;;) {
    let query = admin().from(table).select(columns).order('id').limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error) throw new Error(`no pude leer ${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (rows.length === 0) return;
    await onPage(rows);
    lastId = String(rows[rows.length - 1].id);
    if (rows.length < PAGE_SIZE) return;
  }
}

export const forEachProductPage = (
  columns: string,
  onPage: (rows: Record<string, unknown>[]) => Promise<void> | void,
) => forEachTablePage('products', columns, onPage);

/** Escribe una fila por línea (JSONL) y devuelve cuántas y el SHA-256 del archivo. */
export async function writeProductsJsonl(
  outPath: string,
  table = 'products',
  columns = '*',
): Promise<{ rows: number; sha256: string }> {
  const out = createWriteStream(outPath, { flags: 'wx' });
  const hash = createHash('sha256');
  let rows = 0;
  await forEachTablePage(table, columns, async (page) => {
    for (const row of page) {
      const line = `${JSON.stringify(row)}\n`;
      hash.update(line);
      if (!out.write(line)) await once(out, 'drain');
      rows++;
    }
  });
  out.end();
  await once(out, 'finish');
  return { rows, sha256: hash.digest('hex') };
}

export async function* readJsonl(path: string): AsyncGenerator<Record<string, unknown>> {
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line) as Record<string, unknown>;
  }
}

export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
