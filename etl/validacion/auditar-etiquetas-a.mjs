// Node 22+. Solo archivos locales: sin conexión a Supabase ni a otros servicios.
import { readFile, writeFile } from 'node:fs/promises';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Uso: node auditar-etiquetas-a.mjs PROPUESTAS SALIDA_NUEVA');
  process.exit(1);
}
try {
  const doc = JSON.parse(await readFile(input, 'utf8'));
  if (doc.phase !== 'A' || doc.applied !== false || doc.approved !== false)
    throw new Error('Se exige un borrador de fase A, sin aplicar ni aprobar.');
  const checks = [];
  for (const image of doc.images) {
    if (!/^[a-f0-9]{64}$/.test(image.sha256)) throw new Error('Hash inválido.');
    checks.push({image_id:image.id,check:'doble_transcripcion',
      status:image.independent_transcriptions ? 'acreditada' : 'pendiente',
      visual_reads:image.visual_reads});
  }
  for (const label of doc.transcriptions) {
    const rows = label.rows ?? [];
    const grams = Object.fromEntries(rows.filter(r=>r.unit==='g').map(r=>[r.field,r.value]));
    for (const row of rows) {
      if (row.value === null) continue;
      checks.push({image_id:label.image_id,field:row.field,check:'numero_no_negativo',
        status:typeof row.value==='number' && Number.isFinite(row.value) && row.value>=0 ? 'pasa' : 'falla'});
    }
    for (const [minor,major] of [['sugars','carbohydrates'],['added-sugars','sugars'],['saturated-fat','fat'],['trans-fat','fat']]) {
      if (grams[minor]==null || grams[major]==null) continue;
      checks.push({image_id:label.image_id,check:minor+' <= '+major,
        status:grams[minor]<=grams[major]?'pasa':'falla'});
    }
    const kcal = rows.find(r=>r.field==='energy-kcal')?.value;
    const kj = rows.find(r=>r.field==='energy-kj')?.value;
    if (kcal!=null && kj!=null) checks.push({image_id:label.image_id,check:'kJ contra kcal',
      status:'informativo_sin_umbral_aprobado',kcal,kj,kj_from_kcal:kcal*4.184,
      relative_difference:Math.abs(kj-kcal*4.184)/(kcal*4.184)});
    if (kcal!=null && ['carbohydrates','proteins','fat'].every(k=>grams[k]!=null)) {
      const calculated = 4*grams.carbohydrates+4*grams.proteins+9*grams.fat;
      checks.push({image_id:label.image_id,check:'energia contra macros',
        status:'informativo_no_reemplaza_valor_de_etiqueta',kcal,calculated_kcal:calculated});
    }
    for (const item of label.qualitative ?? []) {
      if (item.numeric_value !== null) throw new Error('Una declaración cualitativa no se convierte en cero.');
    }
  }
  for (const product of doc.products) for (const field of product.fields) {
    if (field.approved !== false) throw new Error('No aprobar campos automáticamente.');
    if (['en_conflicto','base_o_unidad_pendiente'].includes(field.classification) && field.proposed !== null)
      throw new Error('No seleccionar propuestas en conflicto ni mezclar 100 g y 100 ml.');
    if (field.field!=='ingredients_text' && field.proposed!==null && field.candidates.some(c=>c.basis!=='100 g'))
      throw new Error('Un valor por 100 ml no se propone para nutriments por 100 g.');
  }
  for (const product of doc.products) {
    const sources=new Map();
    for (const field of product.fields) for (const candidate of field.candidates) {
      if (typeof candidate.value!=='number') continue;
      const key=candidate.source_url+'|'+candidate.basis;
      const values=sources.get(key)??{source_url:candidate.source_url,basis:candidate.basis,values:{}};
      values.values[field.field.replace(/_100(?:g|ml)$/,'')]=candidate.value;
      sources.set(key,values);
    }
    for(const source of sources.values()) for(const [minor,major] of [['sugars','carbohydrates'],['added-sugars','sugars'],['saturated-fat','fat'],['trans-fat','fat']]) {
      if(source.values[minor]==null||source.values[major]==null)continue;
      checks.push({product_id:product.id,source_url:source.source_url,basis:source.basis,
        check:minor+' <= '+major,status:source.values[minor]<=source.values[major]?'pasa':'falla',
        values:{[minor]:source.values[minor],[major]:source.values[major]}});
    }
  }
  const result={phase:'A',applied:false,approved:false,checks,
    summary:{failed:checks.filter(c=>c.status==='falla').length,
      independent_transcriptions_pending:checks.filter(c=>c.check==='doble_transcripcion' && c.status==='pendiente').length},
    limitations:['No compara octógonos legales: requiere identificar mercado, fecha y criterios del equipo.','No aprueba etiquetas por cercanía de kcal y kJ ni por fórmula energética.','Los hashes registran la imagen, no prueban que el envase esté vigente.']};
  await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log('Controles locales guardados en archivo nuevo. Fallas numéricas: '+result.summary.failed+'. Doble transcripción pendiente: '+result.summary.independent_transcriptions_pending+'. Nada aplicado.');
} catch {
  console.error('No se completó la auditoría: revisar entradas, estados y salida nueva.');
  process.exitCode=1;
}
