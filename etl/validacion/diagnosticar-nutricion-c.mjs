// Diagnóstico offline. Una alerta no autoriza corregir datos.
import {auditNutrition} from './preparar-revision-bc.mjs';
const MAX = {calories:900,protein:100,carbs:100,sugars:100,fats:100,satFats:100,sodium:40000,fiber:100,transFat:100,cholesterol:100000};
export function diagnoseNutrition(raw) {
 const audit=auditNutrition(raw),issues=[];
 const by=Object.fromEntries(audit.fields.map(f=>[f.field,f]));
 for(const f of audit.fields) {
   if(f.status==='valor_invalido'||f.status==='base_no_explicita')issues.push({rule:f.status,fields:[f.field],action:'revisar_sin_corregir'});
   if(f.value!==null && f.value>MAX[f.field])issues.push({rule:'fuera_de_rango',fields:[f.field],value:f.value,max:MAX[f.field],unit:f.unit,action:'revisar_sin_corregir'});
   const sourceUnit=raw?.[f.source_key.replace(/_100g$/u,'_unit')];
   const expected=f.field==='calories'?'kcal':'g';
   // Metadata de unidad puede describir la cifra original, no la normalizada.
   // No decidir entre interpretaciones ni reconvertirla silenciosamente.
   if(f.value!==null && sourceUnit!==undefined && sourceUnit!==null && sourceUnit!==expected)issues.push({rule:'unidad_metadata_por_aclarar',fields:[f.field],observed_unit:sourceUnit,expected_storage_unit:expected,action:'revisar_sin_corregir'});
 }
 for(const [smaller,larger] of [['sugars','carbs'],['satFats','fats'],['transFat','fats']]) {
   const a=by[smaller].value,b=by[larger].value;
   if(a!==null && b!==null && a>b+0.1)issues.push({rule:'relacion_inconsistente',fields:[smaller,larger],values:[a,b],tolerance_g:0.1,action:'revisar_sin_corregir'});
 }
 const macros=['protein','carbs','fats'].map(k=>by[k].value);
 if(macros.every(v=>v!==null) && macros.reduce((a,b)=>a+b,0)>101)issues.push({rule:'suma_macros_mayor_a_100',fields:['protein','carbs','fats'],value:macros.reduce((a,b)=>a+b,0),tolerance_g:1,action:'revisar_sin_corregir'});
 return {...audit,issues,ready_by_format_and_checks:audit.all_required_present && issues.length===0,verified:false,applied:false};
}
