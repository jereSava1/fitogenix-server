// Convierte paneles explícitos, sin extraer OCR ni aplicar cifras a productos.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const MASS_FIELDS=new Set(['protein','carbs','sugars','fats','satFats','sodium','fiber','transFat','cholesterol']);
export function normalizePanel(panel) {
 if(!panel || typeof panel.evidence_id!=='string' || !panel.evidence_id.trim())throw new TypeError('Panel requiere evidence_id explícito.');
 const basis=panel.basis;
 if(!basis || !['g','ml'].includes(basis.unit) || typeof basis.amount!=='number' || !Number.isFinite(basis.amount) || basis.amount<=0)throw new TypeError('Base requiere cantidad positiva explícita en g o ml.');
 if(!Array.isArray(panel.nutrients)||panel.nutrients.length===0)throw new TypeError('Nutrientes explícitos requeridos.');
 const seen=new Set(),factor=100/basis.amount;
 if(!Number.isFinite(factor))throw new TypeError('Factor de base fuera de rango numérico.');
 const fields=panel.nutrients.map(n=>{
   if(!n || seen.has(n.field) || typeof n.value!=='number' || !Number.isFinite(n.value) || n.value<0)throw new TypeError('Campo repetido o cifra inválida.');
   seen.add(n.field);
   let unit,unitFactor;
   if(n.field==='calories' && n.unit==='kcal'){unit='kcal';unitFactor=1;}
   else if(MASS_FIELDS.has(n.field) && ['g','mg'].includes(n.unit)) {
     unit=['sodium','cholesterol'].includes(n.field)?'mg':'g';
     unitFactor=unit===n.unit?1:unit==='mg'?1000:0.001;
   } else throw new TypeError('Campo o unidad incompatibles; no inferir una conversión.');
   const value=n.value*unitFactor*factor;
   if(!Number.isFinite(value))throw new TypeError('Conversión fuera de rango numérico.');
   return {field:n.field,original_value:n.value,original_unit:n.unit,value,unit,target_basis:{amount:100,unit:basis.unit},formula:{unit_factor:unitFactor,portion_factor:factor},verified:false,applied:false};
 });
 return {evidence_id:panel.evidence_id,original_basis:{...basis},target_basis:{amount:100,unit:basis.unit},fields,conversion_checked:true,label_verified:false,apply_authorized:false,applied:false};
}
export async function runPanels(input,output) {
 if(!input||!output||resolve(input)===resolve(output))throw new Error('Salida nueva distinta de entrada.');
 const bytes=await readFile(input);if(bytes.length>20*1024*1024)throw new Error('Dividir archivos mayores a 20 MB.');
 const panels=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u,''));
 if(!Array.isArray(panels))throw new TypeError('Entrada debe ser array de paneles.');
 const ids=new Set();
 const results=panels.map(p=>{if(ids.has(p?.evidence_id))throw new TypeError('evidence_id repetido.');const normalized=normalizePanel(p);ids.add(p.evidence_id);return {original:p,normalized};});
 await writeFile(output,JSON.stringify({phase:'C',version:'c-panel-1',source_sha256:createHash('sha256').update(bytes).digest('hex'),generated_at:new Date().toISOString(),applied:false,approved_for_publication:false,results},null,2)+'\n',{flag:'wx'});
 return {panels:results.length,fields:results.reduce((a,r)=>a+r.normalized.fields.length,0)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await runPanels(...process.argv.slice(2))));}catch(error){console.error(error.message);process.exitCode=1;}}
