// Formato candidato para simulación. No escribe filas ni llama al backend.
import {normalizePanel} from './normalizar-panel-c.mjs';
import {STANDARD} from './preparar-revision-bc.mjs';
export function buildLegacyCandidate(panel) {
 const normalized=normalizePanel(panel);
 if(normalized.target_basis.unit!=='g')return {evidence_id:normalized.evidence_id,normalized,legacy_candidate:null,blockers:['base_ml_requiere_decision_de_contrato_y_fuente'],applied:false,apply_authorized:false};
 const candidate={};
 for(const f of normalized.fields) {
   const definition=STANDARD.find(s=>s[0]===f.field);
   if(!definition)throw new TypeError('Campo no soportado por NutritionFacts.');
   const [,key,,scale]=definition;
   // Almacenamiento legacy: g; presentación: mg. Evitar multiplicar dos veces.
   const value=f.value/scale;
   if(!Number.isFinite(value) || value<0 || (f.value>0 && value===0))throw new TypeError('Conversión de almacenamiento fuera de rango.');
   candidate[`${key}_100g`]=value;
   candidate[`${key}_unit`]=f.field==='calories'?'kcal':'g';
 }
 return {evidence_id:normalized.evidence_id,normalized,legacy_candidate:candidate,blockers:[],candidate_scope:'formato_para_simulacion_no_aprobacion_del_dato',applied:false,apply_authorized:false};
}
