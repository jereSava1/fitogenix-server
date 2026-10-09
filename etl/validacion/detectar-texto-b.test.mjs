import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { detectText, inputRecords, run } from './detectar-texto-b.mjs';

test('Tonadita: conserva la declaración también dentro del texto, sin proponer retirarla', () => {
  const text = 'Crema de leche pasteurizada, sal CONTIENE DERIVADOS DE LECHE.';
  const result = detectText(text);
  assert.equal(result.proposed_text, null);
  assert.equal(result.status, 'conservado_sin_limpieza');
  assert.equal(result.findings[0].action, 'conservar_declaracion');
  assert.equal(result.preserved_declarations[0].fragment, 'CONTIENE DERIVADOS DE LECHE.');
  assert.equal(result.original, text);
  assert.equal(result.applied, false);
  assert.equal(result.verified, false);
});
test('lista legítima con componentes anidados queda intacta', () => {
  const text = 'Queso (leche, cultivos, cloruro de sodio), antiaglutinante (INS 460), conservante (INS 200).';
  assert.equal(detectText(text).status, 'sin_hallazgos_del_detector');
  assert.equal(detectText(text).proposed_text, null);
});
test('sal, vitaminas y enriquecimiento no se borran por ser palabras legales', () => {
  const text = 'Harina de trigo enriquecida según Ley 25630 (hierro, ácido fólico, vitamina B1), agua, sal';
  assert.equal(detectText(text).proposed_text, null);
  assert.equal(detectText(text).original, text);
});
test('sin gluten se conserva como declaración, sin borrar el gluten ingrediente', () => {
  assert.equal(detectText('Gluten de trigo, agua, sal').status, 'sin_hallazgos_del_detector');
  const result = detectText('Libre de\nGLUTEN. Ingredientes: Agua, sal');
  assert.ok(result.preserved_declarations.some(f => f.kind === 'declaracion_alimentaria'));
  assert.equal(result.proposed_text, null);
});
test('INS repetidos se señalan sin deduplicar y cambiar el puntaje', () => {
  const result = detectText('Mejoradores: INS 516, INS 516');
  assert.ok(result.findings.some(f => f.rule === 'ins_repetido'));
  assert.equal(result.proposed_text, null);
});
test('sucralosa con cantidad válida se señala sin quitar el ingrediente', () => {
  const result = detectText('Agua, sucralosa (5mg/100g), cafeína');
  assert.ok(result.findings.some(f => f.rule === 'unidades'));
  assert.equal(result.findings[0].action, 'conservar_cantidad');
  assert.equal(result.status, 'conservado_sin_limpieza');
  assert.equal(result.proposed_text, null);
});
test('unidad suelta se señala sin reinterpretar una cifra', () => {
  assert.ok(detectText('Agua, mg/kg, sal').findings.some(f => f.rule === 'unidades'));
});
test('una unidad suelta requiere revisión; una cantidad no prueba basura', () => {
  const result = detectText('Agua, mg/kg, sal');
  assert.equal(result.status, 'revision_necesaria');
  assert.equal(result.findings[0].action, 'revisar_sin_modificar');
});
test('cantidades decimales con coma y espacios se conservan', () => {
  const result = detectText('Agua, sucralosa (1,5 mg / 100 g), sal');
  assert.equal(result.status, 'conservado_sin_limpieza');
  assert.equal(result.findings[0].kind, 'cantidad_en_ingrediente');
});
test('unidad sin número entre paréntesis no se trata como cantidad explícita', () => {
  assert.equal(detectText('Agua, sucralosa (mg/100g)').status, 'revision_necesaria');
});
test('cantidad sin ingrediente asociado permanece pendiente', () => {
  assert.equal(detectText('Agua, (5mg/100g)').status, 'revision_necesaria');
});
test('cantidad en paréntesis sin cerrar no permite limpieza parcial', () => {
  assert.equal(detectText('Ingredientes: sucralosa (5mg/100g').proposed_text, null);
});
test('advertencia desconocida se conserva sin adivinar su categoría', () => {
  const result = detectText('Agua, sal. Contiene fenilalanina.');
  assert.equal(result.proposed_text, null);
  assert.equal(result.preserved_declarations[0].kind, 'declaracion_por_clasificar');
  assert.equal(result.preserved_declarations[0].fragment, 'Contiene fenilalanina.');
});
test('quitar solo el rótulo mantiene toda la advertencia de leche', () => {
  const result = detectText('Ingredientes: Crema de leche, sal CONTIENE DERIVADOS DE LECHE.');
  assert.equal(result.proposed_text, 'Crema de leche, sal CONTIENE DERIVADOS DE LECHE.');
  assert.deepEqual(result.edits.map(e => e.rule), ['rotulo']);
});
test('alérgenos con ingredientes adicionales mantienen ambos fragmentos', () => {
  const text = 'Contiene leche, conservante sorbato de potasio';
  const result = detectText(text);
  assert.equal(result.original, text);
  assert.equal(result.proposed_text, null);
  assert.equal(result.preserved_declarations[0].kind, 'declaracion_por_clasificar');
});
test('una declaración sola no se convierte en receta', () => {
  const result = detectText('CONTIENE LECHE.');
  assert.equal(result.proposed_text, null);
  assert.equal(result.original, 'CONTIENE LECHE.');
  assert.equal(result.verified, false);
});
test('un salto dentro de un ingrediente no lo convierte en dos', () => {
  const result = detectText('Agua, Gluten de\r\nTrigo, sal');
  assert.equal(result.proposed_text, null);
  assert.equal(result.status, 'revision_necesaria');
});
test('art. no se divide ni se transforma en ingrediente nuevo', () => {
  const result = detectText('aromatizante/saborizante aroma art. a vainilla');
  assert.ok(result.findings.some(f => f.rule === 'abreviatura'));
  assert.equal(result.proposed_text, null);
});
test('no inventa correcciones de OCR ni INS', () => {
  const result = detectText('Aguo, IMAF, Emulsionantes: INS 4821 y INS 71');
  assert.ok(result.findings.some(f => f.rule === 'ocr'));
  assert.equal(result.proposed_text, null);
});
test('paréntesis incompletos impiden una propuesta parcial', () => {
  const result = detectText('Ingredientes: queso (leche, sal');
  assert.ok(result.findings.some(f => f.rule === 'parentesis'));
  assert.equal(result.proposed_text, null);
});
test('paréntesis cerrados antes de abrir también son ambiguos', () => {
  assert.equal(detectText('Agua), sal (').status, 'revision_necesaria');
});
test('rótulo inicial claro se separa sin reescribir la lista', () => {
  const result = detectText('Ingredientes: Agua, sal');
  assert.equal(result.proposed_text, 'Agua, sal');
  assert.equal(result.edits.length, 1);
});
test('el rótulo solo no inventa lista vacía como corrección', () => {
  assert.equal(detectText('Ingredientes:').status, 'sin_lista_utilizable');
});
test('frase de colesterol no es una lista de alérgenos', () => {
  const result = detectText('Agua, sal. Este producto, al igual que todos los de origen vegetal, NO CONTIENE COLESTEROL.');
  assert.equal(result.proposed_text, 'Agua, sal.');
  assert.equal(result.preserved_declarations[0].kind, 'declaracion_comercial');
});
test('fortificación con unidades queda preservada para revisión', () => {
  const text = 'Agua. Según la ley N 25630 la Harina es Adicionado con: Hierro-30 mg/kg.';
  const result = detectText(text);
  assert.ok(result.preserved_declarations.some(f => f.kind === 'declaracion_enriquecimiento'));
  assert.equal(result.proposed_text, null);
});
test('alérgenos pegados a ingredientes adicionales no permiten borrar la cola', () => {
  const result = detectText('Agua, contiene leche, conservante sorbato de potasio');
  assert.equal(result.proposed_text, null);
});
test('alérgenos entre paréntesis no se extraen de un ingrediente compuesto', () => {
  assert.equal(detectText('Chocolate (contiene leche).').proposed_text, null);
});
test('varios alérgenos explícitos conservan la declaración completa', () => {
  const result = detectText('Agua, sal. Puede contener trazas de leche, soja y huevo.');
  assert.equal(result.proposed_text, null);
  assert.equal(result.status, 'conservado_sin_limpieza');
  assert.equal(result.preserved_declarations[0].fragment, 'Puede contener trazas de leche, soja y huevo.');
});
test('instrucciones y fabricante se detectan pero no se recortan a ciegas', () => {
  const result = detectText('Agua, sal. Mantener en lugar fresco. Elaborado por Fábrica. RNE 123');
  assert.ok(result.findings.some(f => f.rule === 'conservacion'));
  assert.ok(result.findings.some(f => f.rule === 'fabricante'));
  assert.equal(result.proposed_text, null);
});
test('ausencia permanece ausencia, sin reconstrucción por nombre', () => {
  for (const text of [null, '', '   ']) assert.equal(detectText(text).status, 'sin_dato');
  assert.throws(() => detectText(undefined), /texto o null/);
  assert.throws(() => detectText(123), /texto o null/);
});
test('las posiciones recuperan exactamente cada fragmento original', () => {
  const text = 'Ingredientes: azúcar, café. CONTIENE LECHE.';
  const result = detectText(text);
  for (const f of result.findings) assert.equal(text.slice(f.start, f.end), f.fragment);
  assert.equal(result.proposed_text, 'azúcar, café. CONTIENE LECHE.');
});
test('segunda pasada no produce nuevas limpiezas en una propuesta aceptable', () => {
  const result = detectText('Ingredientes: Agua, sal CONTIENE LECHE.');
  const again = detectText(result.proposed_text);
  assert.equal(again.status, 'conservado_sin_limpieza');
  assert.equal(again.proposed_text, null);
});
test('datos aplicados o esquema desconocido son rechazados', () => {
  assert.throws(() => inputRecords({ phase: 'A', applied: true, products: [] }), /Entrada/);
  assert.throws(() => inputRecords({ products: [] }), /Entrada/);
});
test('la identidad ambigua de A se conserva agrupada, sin repartir fórmulas entre EAN', () => {
  const source = { phase: 'A', applied: false, date: '2026-10-08', products: [{id: 'ejemplo', name: 'Prueba', barcodes: ['7790787002931','7790787018031'], fields: [{field: 'ingredients_text', current: 'Agua', classification: 'en_conflicto'}]}] };
  const snapshot = structuredClone(source);
  const result = inputRecords(source);
  assert.deepEqual(result[0].barcodes, ['7790787002931','7790787018031']);
  assert.equal(result[0].evidence.field_classification, 'en_conflicto');
  assert.deepEqual(source, snapshot);
});

test('rótulo seguido solo por alérgenos no genera una receta', () => {
  const r = detectText('Ingredientes: CONTIENE LECHE.');
  assert.equal(r.status, 'sin_lista_utilizable');
  assert.equal(r.proposed_text, null);
  assert.equal(r.preserved_declarations[0].fragment, 'CONTIENE LECHE.');
});
test('identidades vacías o duplicadas se rechazan antes de comparar', () => {
  assert.throws(() => inputRecords([{id: '', ingredients_text: null}]), /id/);
  assert.throws(() => inputRecords([{id: 'x', ingredients_text: null}, {id: 'x', ingredients_text: 'Sal'}]), /repetido/);
});
test('códigos numéricos no permiten perder ceros iniciales', () => {
  assert.throws(() => inputRecords([{id: 'x', ingredients_text: null, barcodes: [70847017332]}]), /barcodes/);
  assert.deepEqual(inputRecords([{id: 'x', ingredients_text: null, barcodes: ['0070847017332']}])[0].barcodes, ['0070847017332']);
});
test('fase A incompleta o con campo duplicado se rechaza', () => {
  assert.throws(() => inputRecords({phase:'A', applied:false, products:[{id:'x'}]}), /fields/);
  assert.throws(() => inputRecords({phase:'A', applied:false, products:[{id:'x', fields:[{field:'ingredients_text', current:null},{field:'ingredients_text', current:'Sal'}]}]}), /fields/);
});
test('CLI conserva input, genera salida nueva y rechaza sobrescritura', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fitogenix-b-'));
  try {
    const input = join(dir, 'input.json'), output = join(dir, 'output.json');
    const data = JSON.stringify([{id: 'x', ingredients_text: 'Ingredientes: Agua, sal'}]);
    await writeFile(input, data);
    assert.equal((await run(input, output)).records, 1);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.applied, false);
    assert.equal(report.approved_for_publication, false);
    assert.equal(report.scoring_changed, false);
    assert.equal(await readFile(input, 'utf8'), data);
    await assert.rejects(run(input, output), /EEXIST/);
    await assert.rejects(run(input, input), /distintas/);
  } finally {
    const remainder = relative(resolve(tmpdir()), resolve(dir));
    assert.ok(remainder && !remainder.startsWith('..') && !isAbsolute(remainder) && remainder.startsWith('fitogenix-b-'));
    await rm(dir, {recursive: true, force: true});
  }
});
