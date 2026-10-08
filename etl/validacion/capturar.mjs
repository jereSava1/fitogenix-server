// Node 22+. Solo GET; nunca escribe en Supabase ni ejecuta el ETL.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const codes = [
  '7790787002931', '7790787018031', '7790787251780', '7790787251803',
  '7793890001846', '7792430608637', '7792430608651',
  '7790310983737', '77995681', '0070847017332', '7798060850026',
];
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
async function get(url, headers = {}) {
  try {
    const response = await fetch(url, {
      method: 'GET', headers, redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { ok: false, http_status: response.status };
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, error: 'red_o_respuesta_no_json' };
  }
}
function exactProducts(data, code) {
  if (!Array.isArray(data)) return { status: 'respuesta_no_reconocida' };
  const products = data.filter(p =>
    Array.isArray(p.items) && p.items.some(i => i.ean === code));
  return {
    status: products.length ? 'encontrado' : 'sin_ficha_exacta',
    products: products.map(p => ({
      product_name: p.productName, brand: p.brand, url: p.link,
      ingredients: p.Ingredientes ?? null,
      nutrition: p['Tabla Nutricional'] ?? null,
      items: p.items.filter(i => i.ean === code).map(i => ({
        ean: i.ean, images: (i.images ?? []).map(image => ({
          url: image.imageUrl, text: image.imageText,
        })),
      })),
    })),
  };
}
async function main() {
  const output = option('--out');
  const mode = args.includes('--base') ? 'base' :
    args.includes('--sources') ? 'sources' : null;
  if (!output || !mode || (args.includes('--base') && args.includes('--sources')))
    throw new Error('Usar --base o --sources, y --out ARCHIVO_NUEVO.');
  let branch;
  try { branch = execFileSync('git', ['branch', '--show-current'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { throw new Error('Correr desde una copia local del repo.'); }
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  if (pkg.name !== 'fitogenix-server') throw new Error('Correr desde fitogenix-server.');
  if (branch !== 'etl-validacion')
    throw new Error('Se exige la rama etl-validacion; no se cambia de rama.');
  const protein = option('--protein-barcode');
  if (protein && !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(protein))
    throw new Error('El código de Protein Bar debe ser un código de barras completo.');
  const selected = [...new Set([...codes, ...(protein ? [protein] : [])])];
  const captured = { captured_at: new Date().toISOString(), branch,
    mode, codes: selected, protein_identity_pending: !protein };
  if (mode === 'base') {
    const address = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!address || !key)
      throw new Error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno.');
    const origin = new URL(address);
    if (origin.protocol !== 'https:' || origin.username || origin.password ||
        origin.search || origin.hash || origin.pathname !== '/')
      throw new Error('SUPABASE_URL debe ser el origen HTTPS sin credenciales.');
    const url = new URL('/rest/v1/products', origin);
    url.searchParams.set('select',
      'barcode,product_name,ingredients_text,nutriments,data_source,ai_enriched');
    url.searchParams.set('barcode', 'in.(' + selected.join(',') + ')');
    const result = await get(url, { apikey: key });
    if (!result.ok || !Array.isArray(result.data))
      throw new Error('No se pudo leer products; no se guardó una base ficticia.');
    captured.rows = result.data;
  } else {
    captured.sources = [];
    for (const code of selected) {
      const url = new URL('https://world.openfoodfacts.org/api/v2/product/' +
        code + '.json');
      url.searchParams.set('fields',
        'code,product_name,brands,quantity,serving_size,nutrition_data_per,' +
        'ingredients_text,nutriments,image_ingredients_url,image_nutrition_url,' +
        'last_modified_t');
      const off = await get(url, { 'User-Agent': 'FitogenixPhaseA/1.0' });
      captured.sources.push({ code, source: 'off', url: url.href,
        captured_at: new Date().toISOString(), ...off });
      // <= 15 lecturas OFF por minuto, también si se agrega Protein Bar.
      await new Promise(resolve => setTimeout(resolve, 4500));
      for (const domain of ['www.jumbo.com.ar', 'www.carrefour.com.ar']) {
        const retail = new URL('https://' + domain +
          '/api/catalog_system/pub/products/search');
        retail.searchParams.set('fq', 'alternateIds_Ean:' + code);
        const result = await get(retail);
        captured.sources.push({ code, source: domain, url: retail.href,
          captured_at: new Date().toISOString(),
          ...(result.ok ? exactProducts(result.data, code) : result) });
      }
    }
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(captured, null, 2) + '\n', { flag: 'wx' });
  console.log('Captura nueva guardada. No se aplicó ninguna corrección.');
}
main().catch(error => {
  // Solo errores propios; las respuestas externas y credenciales no se imprimen.
  const allowed = ['Usar ', 'Correr ', 'Se exige ', 'El código ', 'Faltan ',
    'SUPABASE_URL ', 'No se pudo '];
  console.error(allowed.some(prefix => error.message.startsWith(prefix)) ?
    error.message : 'No se pudo completar la captura o el archivo ya existe.');
  process.exitCode = 1;
});

