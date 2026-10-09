// Lee una muestra JSON local y genera diagnóstico nuevo. Sin red ni servicios.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {detectText} from './detectar-texto-b.mjs';
import {diagnoseNutrition} from './diagnosticar-nutricion-c.mjs';
import {makeBatches} from './preparar-revision-bc.mjs';
export function auditRows(rows,sourceHash) {
 if(!Array.isArray(rows)||!/^([a-f0-9]{64})$/u.test(sourceHash))throw new TypeError('Array local y SHA256 requeridos.');
 const codeCounts=new Map();
 for(const row of rows)if(typeof row?.barcode==='string')codeCounts.set(row.barcode,(codeCounts.get(row.barcode)??0)+1);
 const results=rows.map((row,i)=>{
   if(!row || typeof row!=='object' || Array.isArray(row))throw new TypeError('Fila inválida.');
   if(row.barcode!==undefined && row.barcode!==null && (typeof row.barcode!=='string'||!/^\d{8,14}$/u.test(row.barcode)))throw new TypeError('Barcode debe ser texto; no inventar o perder ceros.');
   if(row.ingredients_text!==undefined && row.ingredients_text!==null && typeof row.ingredients_text!=='string')throw new TypeError('ingredients_text inválido.');
   const id=`local-${sourceHash.slice(0,12)}-${String(i+1).padStart(6,'0')}`;
   return {id,source_index:i,identity_type:'posicion_de_archivo_no_identidad_de_producto',identity_issues:codeCounts.get(row.barcode)>1?['barcode_repetido_en_archivo']:[],barcode:row.barcode??null,name:row.product_name??null,original:row,text:detectText(row.ingredients_text??null),nutrition:diagnoseNutrition(row.nutriments),applied:false,verified:false};
 });
 const text_counts={},nutrition_issue_counts={};
 for(const r of results){text_counts[r.text.status]=(text_counts[r.text.status]??0)+1;for(const issue of r.nutrition.issues)nutrition_issue_counts[issue.rule]=(nutrition_issue_counts[issue.rule]??0)+1;}
 return {version:'bc-3',source_sha256:sourceHash,applied:false,approved_for_publication:false,coverage:'archivo_local_no_catalogo_actual',summary:{records:results.length,text_counts,nutrition_complete_by_format:results.filter(r=>r.nutrition.all_required_present).length,nutrition_with_issues:results.filter(r=>r.nutrition.issues.length).length,nutrition_issue_counts,rows_with_identity_issues:results.filter(r=>r.identity_issues.length).length,nutrition_ready_by_checks:results.filter(r=>r.nutrition.ready_by_format_and_checks).length},results,batches:makeBatches(results.map(r=>({id:r.id,source_index:r.source_index,barcode:r.barcode}))),note:'Una posición local no es un EAN inventado. La muestra no valida etiquetas y los lotes no ejecutan escrituras.'};
}
export async function runAudit(input,output) {
 if(!input||!output||resolve(input)===resolve(output))throw new Error('Salida nueva distinta de entrada.');
 const bytes=await readFile(input);if(bytes.length>20*1024*1024)throw new Error('Dividir capturas mayores a 20 MB.');
 const result={...auditRows(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u,'')),createHash('sha256').update(bytes).digest('hex')),generated_at:new Date().toISOString(),source_file:input};
 await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result.summary;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await runAudit(...process.argv.slice(2))));}catch(error){console.error(error.message);process.exitCode=1;}}
