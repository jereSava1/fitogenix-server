// Uso: npm run etl:vtex -- --domain www.carrefour.com.ar --source carrefour [--pages 5] [--pageSize 50]
//      npm run etl:vtex -- --domain ... --source ... --categories [--all-categories]
//
// MODO CATEGORÍAS (--categories): el endpoint genérico corta en el ítem 2500
// —VTEX responde "Parameter _from can't be greater than 2500"— así que sin
// filtro no se puede pasar de ahí por más páginas que se pidan. Filtrando por
// categoría, en cambio, CADA una tiene su propia ventana de 2500, y el árbol
// de Carrefour tiene 449 hojas. Ese es el único camino para bajar el catálogo
// completo de un retailer.
//
// Pagina la API pública de catálogo VTEX (catalog_system/pub/products/search,
// sin auth) — confirmada en vivo contra Jumbo, Disco, Vea y Carrefour el
// 2026-08-06. Adapta cada producto a RawOFFProduct e inserta en
// products_staging. NUNCA escribe en `products`. Ver 06-agente-etl-data.md,
// Fases 3 y 5.
//
// Dominios ya confirmados VTEX: www.jumbo.com.ar, www.disco.com.ar,
// www.vea.com.ar, www.carrefour.com.ar. Antes de sumar un retailer nuevo,
// verificar que responde en ese mismo endpoint (si no, no es VTEX y necesita
// Crawlee en vez de este job — ver Fase 5 del documento del agente).
import 'dotenv/config'; // carga .env — este job corre standalone, no pasa por main.ts
import { randomUUID } from 'node:crypto';
import { adaptVtexProduct } from '../adapters/vtexAdapter';
import { insertStagingRows, stagingLosses, type StagingInsert } from '../lib/staging';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, def?: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  return {
    domain: get('--domain'),
    source: get('--source'),
    pages: Number(get('--pages', '5')),
    pageSize: Number(get('--pageSize', '50')),
    categories: args.includes('--categories'),
    allCategories: args.includes('--all-categories'),
  };
}

// Tope duro de la API: `_from` no puede pasar de 2500, en ninguna consulta.
const VTEX_MAX_OFFSET = 2500;

/**
 * Categorías que valen la pena para Fitogenix. El árbol de un supermercado
 * incluye electro, hogar, perfumería y limpieza; sin este filtro terminamos
 * puntuando detergentes con un motor de alimentos (en el catálogo ya hay un
 * "Ayudin" y un "V05"). Con --all-categories se baja todo igual.
 */
const RELEVANT_CATEGORY = /almac[eé]n|desayuno|merienda|bebida|l[aá]cteo|fresco|carne|pescado|frutas|verdura|panader|congelad|kiosco|golosina|snack|dietetic|diet[eé]tic|sin tacc|infusion|infusi[oó]n|aceite|conserva|pastas|galletit|cereal/i;

type CategoryNode = { id: number; name: string; children?: CategoryNode[] };
type Leaf = { name: string; path: string };

/** Hojas del árbol de categorías, con su ruta completa (VTEX la exige). */
function leavesOf(nodes: CategoryNode[], path: number[] = []): Leaf[] {
  const out: Leaf[] = [];
  for (const n of nodes) {
    const p = [...path, n.id];
    const children = n.children ?? [];
    if (children.length > 0) out.push(...leavesOf(children, p));
    else out.push({ name: n.name, path: p.join('/') });
  }
  return out;
}

async function fetchCategoryLeaves(domain: string, all: boolean): Promise<Leaf[]> {
  const res = await fetch(`https://${domain}/api/catalog_system/pub/category/tree/4`, {
    headers: { 'User-Agent': 'Fitogenix-ETL/0.1 (contacto: soporte@fitogenix.com)' },
  });
  if (!res.ok) {
    console.error(`[ingestVtex] no pude leer el árbol de categorías: HTTP ${res.status}`);
    return [];
  }
  const tree = (await res.json()) as CategoryNode[];
  const leaves = leavesOf(tree);
  if (all) return leaves;

  // Se filtra por el nombre de la hoja O el de alguna de sus ancestras, que
  // es donde suele estar la palabra ("Almacén > Arroz y legumbres > Arroz").
  const byPath = new Map<string, string>();
  const collect = (nodes: CategoryNode[], path: number[], names: string[]) => {
    for (const n of nodes) {
      const p = [...path, n.id];
      const ns = [...names, n.name];
      byPath.set(p.join('/'), ns.join(' > '));
      collect(n.children ?? [], p, ns);
    }
  };
  collect(tree, [], []);

  return leaves.filter((l) => RELEVANT_CATEGORY.test(byPath.get(l.path) ?? l.name));
}

async function fetchPage(domain: string, from: number, to: number, categoryPath?: string): Promise<unknown[]> {
  const fq = categoryPath ? `fq=C:/${categoryPath}/&` : '';
  const url = `https://${domain}/api/catalog_system/pub/products/search?${fq}_from=${from}&_to=${to}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Fitogenix-ETL/0.1 (contacto: soporte@fitogenix.com)' },
  });
  if (!res.ok) {
    console.error(`[ingestVtex] ${url} -> HTTP ${res.status}`);
    return [];
  }
  return (await res.json()) as unknown[];
}

/** Recorre un tramo del catálogo (todo, o una categoría) insertando en
 *  staging. Devuelve cuántos SKUs adaptó. */
async function ingestRange(
  domain: string,
  source: string,
  runId: string,
  pages: number,
  pageSize: number,
  category?: Leaf,
): Promise<number> {
  let adapted = 0;

  for (let page = 0; page < pages; page++) {
    const from = page * pageSize;
    if (from > VTEX_MAX_OFFSET) break; // más allá la API responde 400
    const products = await fetchPage(domain, from, from + pageSize - 1, category?.path);
    if (products.length === 0) break; // fin del tramo

    const batch: StagingInsert[] = [];
    for (const prod of products) {
      for (const r of adaptVtexProduct(prod as Parameters<typeof adaptVtexProduct>[0])) {
        batch.push({ source, barcode: r.barcode, raw: r.raw, runId });
        adapted++;
      }
    }
    await insertStagingRows(batch);

    // Rate limit conservador — nunca a la velocidad máxima que el servidor
    // técnicamente tolera. Ver 06-agente-etl-data.md, sección scrapers.
    await new Promise((r) => setTimeout(r, 500));
  }

  return adapted;
}

async function main() {
  const { domain, source, pages, pageSize, categories, allCategories } = parseArgs();
  if (!domain || !source) {
    console.error(
      'Uso: npm run etl:vtex -- --domain <dominio, ej. www.carrefour.com.ar> --source <nombre-fuente, ej. carrefour> [--pages N] [--pageSize N]',
    );
    process.exit(1);
  }

  const runId = `${source}-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  console.log(`[ingestVtex] run_id=${runId} domain=${domain} source=${source} pages=${pages} pageSize=${pageSize}`);

  let adapted = 0;

  if (categories) {
    const leaves = await fetchCategoryLeaves(domain, allCategories);
    console.log(
      `[ingestVtex] ${leaves.length} categorías a recorrer` +
        (allCategories ? ' (todas)' : ' (solo alimentos — usar --all-categories para bajar el resto)'),
    );

    let i = 0;
    for (const leaf of leaves) {
      i++;
      const n = await ingestRange(domain, source, runId, pages, pageSize, leaf);
      adapted += n;
      console.log(`[ingestVtex] [${i}/${leaves.length}] ${leaf.name}: ${n} SKUs (acumulado ${adapted})`);
    }
  } else {
    adapted = await ingestRange(domain, source, runId, pages, pageSize);
  }

  const losses = stagingLosses();
  console.log(`[ingestVtex] listo. run_id=${runId} adaptados=${adapted}`);
  if (losses.rows > 0) {
    console.error(
      `[ingestVtex] ATENCIÓN: ${losses.rows} filas se perdieron en ${losses.batches} lote(s) fallido(s). ` +
        'Lo adaptado NO es lo que quedó en staging — volver a correr para recuperarlas.',
    );
  }
  console.log('[ingestVtex] siguiente paso: npm run etl:merge -- --limit 200   (validar subconjunto antes de escalar)');
}

main().catch((err) => {
  console.error('[ingestVtex] error fatal:', err);
  process.exit(1);
});
