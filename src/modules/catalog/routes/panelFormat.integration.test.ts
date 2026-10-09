// Prueba en catalog: fixture local; no importa ETL ni llama servicios.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';
import Ajv from 'ajv';
import {extractNutrition} from '../domain/productData';
import {toProductDetail} from '../application/productResponse';
import type {RawProduct} from '../domain/rawProduct';
import {ProductDetailSchema} from './product.schema';
type Preview={id:string;raw_before:RawProduct;raw_candidate:RawProduct;expected_sodium_mg:number};
const previews=JSON.parse(readFileSync(resolve('etl/validacion/fixtures/paneles-backend-c.json'),'utf8')) as Preview[];
const identity={id:'00000000-0000-4000-8000-000000000001',fallbackName:'Prueba local'};
// El schema usa Type.Unsafe con type:['number','null']; validar su JSON Schema.
const validateNutrition=new Ajv().compile(JSON.parse(JSON.stringify(ProductDetailSchema.properties.nutrition)));
describe('panel explícito en presentación real del backend',()=>{
 it('Tonadita devuelve 200 mg con 0.2 g de almacenamiento',()=>{const p=previews.find(p=>p.id==='tonadita')!;expect(p.raw_candidate.nutriments!.sodium_100g).toBe(0.2);expect(extractNutrition(p.raw_candidate.nutriments).sodium).toBe(200);});
 it('referencia Doritos devuelve 672; original sigue 664',()=>{const p=previews.find(p=>p.id==='doritos')!;expect(extractNutrition(p.raw_before.nutriments).sodium).toBe(664);expect(extractNutrition(p.raw_candidate.nutriments).sodium).toBe(672);});
 it('respuesta real usa el panel y cumple el schema nutricional',()=>{for(const p of previews){const response=toProductDetail(p.raw_candidate,identity);expect(response.nutrition.sodium).toBe(p.expected_sodium_mg);expect(validateNutrition(response.nutrition),JSON.stringify(validateNutrition.errors)).toBe(true);expect(Object.hasOwn(response,'normalized')).toBe(false);}});
 it('conserva todos los demás nutrientes de Doritos',()=>{const p=previews.find(p=>p.id==='doritos')!,before=extractNutrition(p.raw_before.nutriments),after=extractNutrition(p.raw_candidate.nutriments);expect({...after,sodium:before.sodium}).toEqual(before);});
 it('colesterol se presenta en mg y ausencia permanece null',()=>{expect(extractNutrition({cholesterol_100g:0.0022}).cholesterol).toBe(2.2);expect(extractNutrition({sodium_100g:0.2}).fiber).toBeNull();});
 it('presentación no muta los productos',()=>{const snapshot=structuredClone(previews);for(const p of previews)toProductDetail(p.raw_candidate,identity);expect(previews).toEqual(snapshot);});
});
