import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { compareSources, runComparison } from './comparar-fuentes-b.mjs';
const code='0070847017332';
const capture=()=>({phase:'A',applied:false,products:[{id:'monster',barcodes:[code],current:{ingredients_text:'Agua, sucralosa (5mg/100g)',nutriments:{salt_100g:1.66,sodium_100g:0.664}}}]});
const web=()=>({applied:false,api_used:false,records:[{barcode:code,control_id:'monster',url:`https://www.barcodelookup.com/${code}`,status:'ficha_encontrada',identity_verified:false,nutrition_basis:null,nutrients:[{field:'salt_100g',value:1.66,unit:'g'}]}]});
test('sal coincide solo con sal; no deriva ni sobrescribe sodio',()=>{
 const a=capture(),b=web(),saved=structuredClone(a),r=compareSources(a,b);
 assert.equal(r.results[0].fields[0].field,'salt_100g');
 assert.equal(r.summary.numeric_matches,1); assert.equal(r.summary.comparable_fields,0);
 assert.deepEqual(a,saved); assert.equal(r.applied,false);
});
test('porción en descripción no prueba base de la tabla',()=>{
 const b=web(); b.records[0].declared_serving_ml=200;
 assert.equal(compareSources(capture(),b).results[0].fields[0].comparable,false);
});
test('cifra nueva es candidata sin normalizar',()=>{
 const b=web(); b.records[0].nutrients=[{field:'carbohydrates_100g',value:12.9,unit:'g'}];
 const r=compareSources(capture(),b);
 assert.equal(r.summary.candidate_fields_missing,1);
 assert.equal(r.results[0].fields[0].web_value,12.9);
 assert.equal(r.results[0].fields[0].web_basis,null);
});
test('ficha mezclada con otro producto bloquea aun con base explícita',()=>{
 const b=web();Object.assign(b.records[0],{identity_conflict:true,identity_verified:true,nutrition_basis:'100g'});
 const r=compareSources(capture(),b); assert.equal(r.summary.identity_conflicts,1);
 assert.equal(r.results[0].fields[0].comparable,false);
});
test('ausencia en la fuente no invalida el código',()=>{
 const b=web();b.records[0].status='no_encontrado_en_fuente';b.records[0].nutrients=[];
 const r=compareSources(capture(),b);assert.equal(r.summary.missing_in_source,1);assert.equal(r.results[0].barcode,code);
 assert.equal(Object.hasOwn(r.results[0],'barcode_is_invalid'),false);
});
test('rechaza códigos desconocidos, repetidos, números y URL distinta',()=>{
 const b=web();b.records.push({...b.records[0]});assert.throws(()=>compareSources(capture(),b),/repetido/);
 for(const replacement of [70847017332,'7790310983737']) {const v=web();v.records[0].barcode=replacement;assert.throws(()=>compareSources(capture(),v));}
 const v=web();v.records[0].url='https://example.com';assert.throws(()=>compareSources(capture(),v),/Fuente/);
});
test('rechaza unidades incompatibles y números no finitos o negativos',()=>{
 for(const update of [{unit:'mg'},{value:NaN},{value:-1},{value:Infinity},{field:'no_existe'}]) {const b=web();Object.assign(b.records[0].nutrients[0],update);assert.throws(()=>compareSources(capture(),b),/Nutriente/);}
 const b=web();b.records[0].nutrients.push({...b.records[0].nutrients[0]});assert.throws(()=>compareSources(capture(),b),/Nutriente/);
});
test('conserva original y solo comprueba coincidencia de extracto por caja y espacios',()=>{
 const b=web();b.records[0].ingredients_snippet='SUCRALOSA   (5mg/100g)';
 const r=compareSources(capture(),b);assert.equal(r.results[0].ingredients.snippet_matches_after_case_and_spaces,true);
 assert.equal(r.results[0].ingredients.verified,false);
});
test('archivos de comparación no pueden reemplazar entrada ni una salida existente',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fitogenix-b-comparar-'));
 try {
 const a=join(dir,'a.json'),b=join(dir,'b.json'),out=join(dir,'result.json');
 await writeFile(a,JSON.stringify(capture()));await writeFile(b,JSON.stringify(web()));
 const original=await readFile(a,'utf8');assert.equal((await runComparison(a,b,out)).codes,1);
 await assert.rejects(runComparison(a,b,out),/EEXIST/);
 await assert.rejects(runComparison(a,b,a),/distinta/);await assert.rejects(runComparison(a,b,b),/distinta/);
 assert.equal(await readFile(a,'utf8'),original);
 } finally {const inside=relative(resolve(tmpdir()),resolve(dir));assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside) && inside.startsWith('fitogenix-b-comparar-'));await rm(dir,{recursive:true,force:true});}
});
