// Solo archivos. Registra criterio humano, pendientes y normalización de formato.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareSources } from './comparar-fuentes-b.mjs';
import { detectText, inputRecords } from './detectar-texto-b.mjs';

export const STANDARD = [
 ['calories','energy-kcal','kcal',1,true], ['protein','proteins','g',1,true],
 ['carbs','carbohydrates','g',1,true], ['sugars','sugars','g',1,true],
 ['fats','fat','g',1,true], ['satFats','saturated-fat','g',1,true],
 ['sodium','sodium','mg',1000,true], ['fiber','fiber','g',1,true],
 ['transFat','trans-fat','g',1,false], ['cholesterol','cholesterol','mg',1000,false],
];
// Alcance de la decisión humana sobre esta muestra, no aprobación universal.
export const NUMERIC_ACCEPTANCE_POLICY = Object.freeze({
 id:'guille-muestra-2026-10-08',scope:'15_valores_revisados',
 targets:Object.freeze([
 ['7790310983737','energy-kcal_100g',504],['7790310983737','fat_100g',32],
 ['7790310983737','saturated-fat_100g',3.6],['7790310983737','carbohydrates_100g',48],
 ['7790310983737','proteins_100g',5.6],['7790310983737','salt_100g',1.66],
 ['7790310983737','energy-kj_100g',2110],['7790310983737','sugars_100g',2.4],
 ['7790310983737','fiber_100g',8.8],['7790787018031','energy-kcal_100g',500],
 ['7790787018031','fat_100g',29],['7790787018031','saturated-fat_100g',18],
 ['7790787018031','carbohydrates_100g',6],['7790787018031','proteins_100g',41],
 ['7790787018031','salt_100g',1.1],
 ].map(t=>Object.freeze(t))),
});
export function auditNutrition(nutriments) {
 if (nutriments !== undefined && nutriments !== null && (typeof nutriments !== 'object' || Array.isArray(nutriments))) throw new TypeError('nutriments debe ser objeto.');
 const raw=nutriments ?? {};
 const fields=STANDARD.map(([field,key,unit,scale,required])=>{
   const source_key=`${key}_100g`, original=raw[source_key];
   let value=null, status='faltante';
   if (original!==undefined && original!==null && original!=='') {
     const number=typeof original==='number'?original:typeof original==='string' && /^\s*\d+(?:\.\d+)?\s*$/u.test(original)?Number(original):NaN;
     if (Number.isFinite(number) && number>=0 && Number.isFinite(number*scale)) {value=number*scale;status='formato_normalizado';} else status='valor_invalido';
   } else if (Object.hasOwn(raw,key)) status='base_no_explicita';
   return {field,source_key,original:original ?? null,value,unit,declared_key_basis:'100g',status,required,verified:false,applied:false};
 });
 return {fields,missing_required:fields.filter(f=>f.required && f.value===null).map(f=>f.field),all_required_present:fields.filter(f=>f.required).every(f=>f.value!==null),basis_for_liquids:'no_inferida',verified:false,applied:false};
}
export function makeBatches(records,size=50) {
 if (!Number.isInteger(size) || size<1 || size>50) throw new TypeError('Lotes de 1 a 50.');
 const seen=new Set();
 for(const r of records) {if(!r || typeof r.id!=='string' || !r.id.trim() || seen.has(r.id)) throw new TypeError('Identidad inválida o repetida.');seen.add(r.id);}
 return Array.from({length:Math.ceil(records.length/size)},(_,i)=>({batch:i+1,records:records.slice(i*size,(i+1)*size),applied:false}));
}
export function prepareReview(capture,web) {
 const textRecords=inputRecords(capture);
 const comparison=compareSources(capture,web);
 const accepted=[],pending=[];
 for(const row of comparison.results) {
   if(row.status==='no_encontrado_en_fuente') pending.push({id:row.id,barcode:row.barcode,kind:'ausente_en_fuente',action:'sin_decision_no_invalida_codigo',url:row.url});
   if(row.identity_conflict) pending.push({id:row.id,barcode:row.barcode,kind:'ficha_conflictiva',action:'hablar_con_equipo',url:row.url,issues:row.issues});
   for(const f of row.fields) {
     const item={id:row.id,barcode:row.barcode,url:row.url,...f};
     const inHumanScope=NUMERIC_ACCEPTANCE_POLICY.targets.some(([code,field,value])=>code===row.barcode && field===f.field && value===f.current);
     if(f.status==='coincidencia_numerica' && !row.identity_conflict && inHumanScope) accepted.push({...item,review_status:'aceptado_por_coincidencia_numerica',accepted_by:'Guille',approval_policy:NUMERIC_ACCEPTANCE_POLICY.id,validation_scope:'valor_numerico',basis_and_formula_confirmed:f.comparable,independent_source_proven:false,apply_authorized:false});
     else pending.push({...item,kind:row.identity_conflict?'dato_de_ficha_conflictiva':f.status==='dato_candidato_faltante'?'candidato_faltante':f.status==='coincidencia_numerica'?'coincidencia_nueva_pendiente':'diferencia_numerica',action:'sin_decision_hablar_con_equipo'});
   }
 }
 const products=textRecords.map(r=>{
   const source=capture.products.find(p=>p.id===r.id);
   const text=detectText(r.ingredients_text), nutrition=auditNutrition(source.current?.nutriments);
   return {id:r.id,name:r.name,barcodes:r.barcodes,original_ingredients:r.ingredients_text,text,nutrition,applied:false};
 });
 return {version:'bc-1',phase_b:'criterio_humano_registrado_y_pendientes_separados',phase_c:'prototipo_local_de_formato_no_integrado',phase_d:'preparacion_de_lotes_sin_aplicacion',human_instruction_date:'2026-10-08',applied:false,approved_for_publication:false,summary:{numeric_values_accepted:accepted.length,pending_missing_candidates:pending.filter(p=>p.kind==='candidato_faltante'||p.kind==='dato_de_ficha_conflictiva'&&p.status==='dato_candidato_faltante').length,conflict_products:comparison.summary.identity_conflicts,products:products.length,nutrition_complete_by_format:products.filter(p=>p.nutrition.all_required_present).length},accepted_numeric_values:accepted,pending_decisions:pending,products,batches:makeBatches(products.map(p=>({id:p.id,barcodes:p.barcodes}))),notes:['No se transfieren candidatos web a nutrición normalizada.','Formato normalizado no significa etiqueta verificada.','Lotes son planificación local, no ejecución de fase D.']};
}
export async function runReview(input,source,output) {
 if(!input||!source||!output||[resolve(input),resolve(source)].includes(resolve(output))) throw new Error('Salida nueva distinta de entradas.');
 const a=await readFile(input),b=await readFile(source);
 if(a.length>20*1024*1024||b.length>20*1024*1024) throw new Error('Dividir archivos mayores a 20 MB.');
 const parse=x=>JSON.parse(x.toString('utf8').replace(/^\uFEFF/u,''));
 const result={...prepareReview(parse(a),parse(b)),generated_at:new Date().toISOString(),capture_sha256:createHash('sha256').update(a).digest('hex'),web_sha256:createHash('sha256').update(b).digest('hex')};
 await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 return result.summary;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 try {console.log(JSON.stringify(await runReview(...process.argv.slice(2))));}
 catch(error) {console.error(error.message);process.exitCode=1;}
}
