import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {auditNutrition,makeBatches,prepareReview,runReview,STANDARD} from './preparar-revision-bc.mjs';
const code='7790310983737';
const fixture=()=>({a:{phase:'A',date:'2026-10-08',applied:false,products:[{id:'doritos',name:'Doritos',barcodes:[code],fields:[{field:'ingredients_text',current:null}],current:{ingredients_text:null,nutriments:{salt_100g:1.66,sodium_100g:0.664}}}]},b:{api_used:false,applied:false,records:[{barcode:code,control_id:'doritos',url:`https://www.barcodelookup.com/${code}`,status:'ficha_encontrada',nutrition_basis:null,identity_verified:false,nutrients:[{field:'salt_100g',value:1.66,unit:'g'}]}]}});
test('registra aceptación humana del número sin falsear base ni verificación',()=>{
 const {a,b}=fixture(),r=prepareReview(a,b),item=r.accepted_numeric_values[0];
 assert.equal(r.summary.numeric_values_accepted,1);assert.equal(item.accepted_by,'Guille');assert.equal(item.validation_scope,'valor_numerico');
 assert.equal(item.basis_and_formula_confirmed,false);assert.equal(item.verified,false);assert.equal(item.apply_authorized,false);assert.equal(r.applied,false);
});
test('faltantes se apartan sin copiarlos al estándar nutricional',()=>{
 const {a,b}=fixture();b.records[0].nutrients.push({field:'fiber_100g',value:8.8,unit:'g'});
 const r=prepareReview(a,b);assert.equal(r.summary.pending_missing_candidates,1);assert.equal(r.pending_decisions[0].kind,'candidato_faltante');
 assert.equal(r.products[0].nutrition.fields.find(f=>f.field==='fiber').value,null);
});
test('una coincidencia nueva no se atribuye como aceptación humana',()=>{
 const {a,b}=fixture();a.products[0].current.nutriments.salt_100g=2;b.records[0].nutrients[0].value=2;
 const r=prepareReview(a,b);assert.equal(r.accepted_numeric_values.length,0);assert.equal(r.pending_decisions[0].kind,'coincidencia_nueva_pendiente');
 assert.equal(Object.hasOwn(r.pending_decisions[0],'accepted_by'),false);
});
test('conflicto de ficha excluye incluso números coincidentes',()=>{
 const {a,b}=fixture();b.records[0].identity_conflict=true;
 const r=prepareReview(a,b);assert.equal(r.summary.numeric_values_accepted,0);assert.equal(r.summary.conflict_products,1);assert.ok(r.pending_decisions.some(p=>p.kind==='ficha_conflictiva'));
});
test('diferencias quedan pendientes, no se corrigen con la web',()=>{
 const {a,b}=fixture();b.records[0].nutrients[0].value=2;
 const r=prepareReview(a,b);assert.equal(r.pending_decisions[0].kind,'diferencia_numerica');assert.equal(a.products[0].current.nutriments.salt_100g,1.66);
});
test('convierte gramos de sodio y colesterol antes de cualquier presentación',()=>{
 const r=auditNutrition({sodium_100g:0.046,cholesterol_100g:0.0022});
 assert.equal(r.fields.find(f=>f.field==='sodium').value,46);assert.equal(r.fields.find(f=>f.field==='cholesterol').value,2.2);
});
test('cero explícito se conserva, ausencia no se rellena con cero',()=>{
 const r=auditNutrition({sugars_100g:0});assert.equal(r.fields.find(f=>f.field==='sugars').value,0);assert.equal(r.fields.find(f=>f.field==='fiber').value,null);
});
test('sal no se convierte ni reemplaza un sodio ausente',()=>{
 assert.equal(auditNutrition({salt_100g:1.66}).fields.find(f=>f.field==='sodium').value,null);
});
test('valores sin sufijo de base no se consideran por 100 g',()=>{
 const f=auditNutrition({sodium:0.046}).fields.find(f=>f.field==='sodium');assert.equal(f.value,null);assert.equal(f.status,'base_no_explicita');
});
test('rechaza valores negativos, booleanos, infinitos y coma ambigua',()=>{
 for(const sodium_100g of [-1,true,Infinity,'0,046',' ',NaN]) {const f=auditNutrition({sodium_100g}).fields.find(f=>f.field==='sodium');assert.equal(f.value,null);assert.equal(f.status,'valor_invalido');}
 assert.throws(()=>auditNutrition([]),/objeto/);
});
test('texto decimal explícito se admite; no cambia originales ni infiere ml',()=>{
 const raw={sodium_100g:'0.046'},before=structuredClone(raw),r=auditNutrition(raw);assert.equal(r.fields.find(f=>f.field==='sodium').value,46);assert.deepEqual(raw,before);assert.equal(r.basis_for_liquids,'no_inferida');
});
test('completitud de formato no equivale a verificación de etiqueta',()=>{
 const r=auditNutrition(Object.fromEntries(STANDARD.filter(s=>s[4]).map(s=>[`${s[1]}_100g`,0])));assert.equal(r.all_required_present,true);assert.equal(r.verified,false);assert.equal(r.applied,false);
});
test('lotes de 50 preservan registros agrupados sin duplicar ni perder entradas',()=>{
 const records=Array.from({length:101},(_,i)=>({id:`p${i}`,barcodes:i===0?['7790787002931','7790787018031']:[]})),r=makeBatches(records);
 assert.deepEqual(r.map(b=>b.records.length),[50,50,1]);assert.deepEqual(r.flatMap(b=>b.records),records);assert.deepEqual(r[0].records[0].barcodes,records[0].barcodes);assert.equal(makeBatches([]).length,0);
 assert.throws(()=>makeBatches(records,51));assert.throws(()=>makeBatches(records,0));assert.throws(()=>makeBatches([{id:'x'},{id:'x'}]),/repetida/);
});
test('ejecución genera informe nuevo y protege entradas y salida existente',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fitogenix-bc-'));
 try {const {a,b}=fixture(),input=join(dir,'a.json'),source=join(dir,'b.json'),out=join(dir,'out.json');
 await writeFile(input,JSON.stringify(a));await writeFile(source,JSON.stringify(b));const before=await readFile(input,'utf8');
 assert.equal((await runReview(input,source,out)).numeric_values_accepted,1);assert.equal(await readFile(input,'utf8'),before);
 await assert.rejects(runReview(input,source,out),/EEXIST/);await assert.rejects(runReview(input,source,input),/distinta/);await assert.rejects(runReview(input,source,source),/distinta/);
 } finally {const inside=relative(resolve(tmpdir()),resolve(dir));assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside)&&inside.startsWith('fitogenix-bc-'));await rm(dir,{recursive:true,force:true});}
});
