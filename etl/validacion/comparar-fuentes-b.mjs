// Comparación offline. No SDK, API, scraper masivo ni escritura en tablas.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const UNITS = {'energy-kcal_100g':'kcal','energy-kj_100g':'kJ','fat_100g':'g','saturated-fat_100g':'g','carbohydrates_100g':'g','proteins_100g':'g','salt_100g':'g','sodium_100g':'g','sugars_100g':'g','fiber_100g':'g','cholesterol_100g':'g'};
const normalized = text => text.toLocaleLowerCase('es').replace(/\s+/gu,' ').trim();
export function compareSources(capture, web) {
  if (capture?.phase !== 'A' || capture.applied !== false || !Array.isArray(capture.products) || web?.applied !== false || web.api_used !== false || !Array.isArray(web.records)) throw new TypeError('Capturas locales sin aplicar requeridas.');
  const seen = new Set();
  const results = web.records.map(r => {
    if (typeof r.barcode !== 'string' || !/^\d{8,14}$/u.test(r.barcode) || seen.has(r.barcode)) throw new TypeError('Código de texto inválido o repetido.');
    seen.add(r.barcode);
    if (r.url !== `https://www.barcodelookup.com/${r.barcode}`) throw new TypeError('Fuente no corresponde al código.');
    const matches = capture.products.filter(p=>Array.isArray(p.barcodes) && p.barcodes.includes(r.barcode));
    if (matches.length !== 1 || matches[0].id !== r.control_id) throw new TypeError('Código no conocido o identidad ambigua.');
    if (!['ficha_encontrada','no_encontrado_en_fuente'].includes(r.status)) throw new TypeError('Estado de lectura desconocido.');
    const p = matches[0], fields = [], fieldNames = new Set();
    for (const n of r.nutrients ?? []) {
      if (!Object.hasOwn(UNITS,n.field) || UNITS[n.field] !== n.unit || typeof n.value !== 'number' || !Number.isFinite(n.value) || n.value < 0 || fieldNames.has(n.field)) throw new TypeError('Nutriente, unidad o cifra inválidos.');
      fieldNames.add(n.field);
      const current = p.current?.nutriments?.[n.field];
      const hasCurrent = typeof current === 'number' && Number.isFinite(current);
      const blockers = [];
      if (r.nutrition_basis !== '100g') blockers.push('base_nutricional_no_comparable');
      if (r.identity_verified !== true) blockers.push('identidad_formula_pendiente');
      if (r.identity_conflict === true) blockers.push('ficha_con_identidad_conflictiva');
      fields.push({field:n.field,current:hasCurrent?current:null,current_basis:'100g',web_value:n.value,web_unit:n.unit,web_basis:r.nutrition_basis ?? null,status:!hasCurrent?'dato_candidato_faltante':current===n.value?'coincidencia_numerica':'diferencia_numerica',comparable:blockers.length===0,blockers,verified:false,applied:false});
    }
    const snippet = r.ingredients_snippet ?? null;
    const original = p.current?.ingredients_text ?? null;
    return {id:p.id,barcode:r.barcode,url:r.url,title:r.visible_title ?? null,status:r.status,identity_conflict:r.identity_conflict===true,ingredients:{original,web_snippet:snippet,snippet_matches_after_case_and_spaces:typeof original==='string' && typeof snippet==='string'?normalized(original).includes(normalized(snippet)):null,verified:false},fields,issues:r.issues ?? r.blockers ?? [],applied:false,verified:false};
  });
  const fields = results.flatMap(r=>r.fields);
  return {phase:'B',applied:false,approved_for_publication:false,verified:false,summary:{codes:results.length,found:results.filter(r=>r.status==='ficha_encontrada').length,missing_in_source:results.filter(r=>r.status==='no_encontrado_en_fuente').length,identity_conflicts:results.filter(r=>r.identity_conflict).length,candidate_fields_missing:fields.filter(f=>f.status==='dato_candidato_faltante').length,numeric_matches:fields.filter(f=>f.status==='coincidencia_numerica').length,numeric_differences:fields.filter(f=>f.status==='diferencia_numerica').length,comparable_fields:fields.filter(f=>f.comparable).length},results};
}
export async function runComparison(input, source, output) {
  if (!input || !source || !output || [resolve(input),resolve(source)].includes(resolve(output))) throw new Error('Salida nueva distinta de las entradas.');
  const a = await readFile(input), b = await readFile(source);
  if (a.length > 20*1024*1024 || b.length > 20*1024*1024) throw new Error('Dividir archivos mayores a 20 MB.');
  const parse = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u,''));
  const report = {...compareSources(parse(a),parse(b)),generated_at:new Date().toISOString(),capture_sha256:createHash('sha256').update(a).digest('hex'),web_sha256:createHash('sha256').update(b).digest('hex')};
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  return report.summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runComparison(...process.argv.slice(2)))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
