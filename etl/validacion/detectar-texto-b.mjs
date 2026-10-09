// Fase B: diagnóstico y propuestas locales. Sin servicios, scoring ni escrituras de base.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RULES = [
  { id: 'rotulo', kind: 'rotulo', pattern: /(?:^|[\r\n])\s*ingredientes\s*[:,]/giu, removable: true },
  { id: 'alergenos', kind: 'declaracion_alergenos', pattern: /\b(?:contiene(?:n)?|puede(?:n)? contener(?: trazas de)?)\s+[^.\r\n;]+[.;]?/giu },
  { id: 'conservacion', kind: 'conservacion', pattern: /\b(?:mantener en lugar (?:fresco|seco)|conservar refrigerado|una vez abierto|mantener refrigerado)\b[^.\r\n;]*[.;]?/giu },
  { id: 'fabricante', kind: 'fabricante_registro', pattern: /\b(?:elaborado por|elaborado en|industria argentina|RNE|RNPA|establecimiento)\b[^.\r\n;]*[.;]?/giu },
  { id: 'sin_colesterol', kind: 'declaracion_comercial', pattern: /\bEste producto, al igual que todos los de origen vegetal,\s*NO CONTIENE COLESTEROL\s*[.]?/giu, removable: true },
  { id: 'fortificacion', kind: 'declaracion_enriquecimiento', pattern: /\bseg[uú]n la ley\b[^\r\n]*/giu },
  { id: 'sin_gluten', kind: 'declaracion_alimentaria', pattern: /\b(?:sin T\.?A\.?C\.?C\.?|libre de\s+gluten)\b/giu },
  { id: 'unidades', kind: 'cantidad_o_unidad', pattern: /\b(?:\d+(?:[.,]\d+)?\s*)?(?:mg\s*\/\s*kg|mg\s*\/\s*100\s*g|g\s*\/\s*100\s*g)\b/giu },
  { id: 'abreviatura', kind: 'abreviatura_con_punto', pattern: /\bart\.(?=\s)/giu },
  { id: 'ocr', kind: 'ocr_sospechoso', pattern: /\b(?:SINT|RALLAD0|Aguo|IMAF|4821|INS\s+71)\b/giu },
];

function depthAt(text, position) {
  let depth = 0;
  for (const char of text.slice(0, position)) {
    if (char === '(') depth++;
    if (char === ')') depth--;
  }
  return depth;
}

function explicitAllergens(fragment) {
  const body = fragment.replace(/^(?:contiene(?:n)?|puede(?:n)? contener(?: trazas de)?)\s+/iu, '').replace(/[.;]$/, '').trim();
  const allergen = '(?:derivados de leche|leche|soja|huevo|huevos|trigo|gluten|man[ií]|frutos secos|sulfitos|s[eé]samo|pescado|crust[aá]ceos)';
  return new RegExp(`^${allergen}(?:\\s*(?:,|y)\\s*${allergen})*$`, 'iu').test(body);
}

function balanced(text) {
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

export function detectText(text) {
  if (text !== null && typeof text !== 'string') throw new TypeError('ingredients_text debe ser texto o null.');
  if (text === null || !text.trim()) return { original: text, status: 'sin_dato', findings: [], proposed_text: null, preserved_declarations: [], edits: [], applied: false, verified: false };
  const findings = [];
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (rule.id === 'alergenos' && /\bno\s*$/iu.test(text.slice(0, start))) continue;
      const atTop = depthAt(text, start) === 0;
      const atEnd = !text.slice(end).trim();
      const remove = Boolean(rule.removable && atTop && (
        rule.id === 'rotulo' || rule.id === 'sin_colesterol'
      ));
      // Una advertencia clara se registra, pero sigue dentro del texto candidato.
      const preserveDeclaration = rule.id === 'alergenos' && atTop && atEnd && explicitAllergens(match[0]);
      const before = text.slice(0, start);
      const quantityInIngredient = rule.id === 'unidades' && depthAt(text, start) === 1
        && /^\d/u.test(match[0]) && /(?:^|[,;])\s*[\p{L}\p{M}][\p{L}\p{M}\s-]*\(\s*$/u.test(before)
        && /^\s*\)/u.test(text.slice(end));
      const action = remove ? 'proponer_separacion' : preserveDeclaration ? 'conservar_declaracion'
        : quantityInIngredient ? 'conservar_cantidad' : 'revisar_sin_modificar';
      const kind = quantityInIngredient ? 'cantidad_en_ingrediente' : rule.id === 'alergenos' && !explicitAllergens(match[0])
        ? 'declaracion_por_clasificar' : rule.kind;
      findings.push({ rule: rule.id, kind, start, end, fragment: match[0], action });
    }
  }
  if (!balanced(text)) findings.push({ rule: 'parentesis', kind: 'estructura_incompleta', start: 0, end: text.length, fragment: text, action: 'revisar_sin_modificar' });
  if (/[\r\n]/u.test(text)) findings.push({ rule: 'saltos', kind: 'saltos_de_linea', start: 0, end: text.length, fragment: text, action: 'revisar_sin_modificar' });
  const codes = new Set();
  for (const match of text.matchAll(/\bINS\s*(?:n[°º]?\s*)?(\d+[a-z]?)/giu)) {
    const code = match[1].toLowerCase();
    if (codes.has(code)) findings.push({ rule: 'ins_repetido', kind: 'posible_repeticion', start: match.index, end: match.index + match[0].length, fragment: match[0], action: 'revisar_sin_modificar' });
    codes.add(code);
  }
  const edits = findings.filter(f => f.action === 'proponer_separacion').sort((a, b) => a.start - b.start);
  // No combinar propuestas superpuestas ni limpiar a medias un texto ambiguo.
  const overlap = edits.some((e, i) => i > 0 && e.start < edits[i - 1].end);
  const blocked = overlap || findings.some(f => f.action === 'revisar_sin_modificar');
  let candidate = text;
  for (const e of [...edits].reverse()) candidate = candidate.slice(0, e.start) + candidate.slice(e.end);
  candidate = candidate.trim();
  let ingredientRemainder = candidate;
  for (const f of [...findings].filter(f => f.action === 'conservar_declaracion').sort((a, b) => b.start - a.start)) {
    ingredientRemainder = ingredientRemainder.replace(f.fragment, '');
  }
  const hasIngredientText = /[\p{L}\p{N}]/u.test(ingredientRemainder);
  const proposed = !blocked && edits.length > 0 && candidate && hasIngredientText ? candidate : null;
  return {
    original: text,
    status: blocked ? 'revision_necesaria' : proposed !== null ? 'propuesta_pendiente_revision' : edits.length > 0 ? 'sin_lista_utilizable' : findings.length > 0 ? 'conservado_sin_limpieza' : 'sin_hallazgos_del_detector',
    findings,
    proposed_text: proposed,
    preserved_declarations: findings.filter(f => ['declaracion_alergenos', 'declaracion_por_clasificar', 'declaracion_comercial', 'declaracion_enriquecimiento', 'declaracion_alimentaria'].includes(f.kind)),
    edits: proposed !== null ? edits : [],
    applied: false,
    verified: false,
  };
}

export function inputRecords(doc) {
  function validate(records) {
    const ids = new Set();
    for (const p of records) {
      if (!p || typeof p.id !== 'string' || !p.id.trim() || ids.has(p.id)) throw new TypeError('Entrada: id vacío o repetido.');
      ids.add(p.id);
      if (p.ingredients_text !== null && typeof p.ingredients_text !== 'string') throw new TypeError('Entrada: ingredients_text debe ser texto o null.');
      if (p.barcodes !== undefined && (!Array.isArray(p.barcodes) || p.barcodes.some(b => typeof b !== 'string' || !/^\d{8,14}$/u.test(b)))) throw new TypeError('Entrada: barcodes debe contener códigos como texto.');
    }
    return records;
  }
  if (doc?.phase === 'A' && doc.applied === false && Array.isArray(doc.products)) {
    if (doc.products.some(p => !p || !Array.isArray(p.fields) || p.fields.some(f => !f || typeof f.field !== 'string') || p.fields.filter(f => f.field === 'ingredients_text').length > 1)) throw new TypeError('Entrada: fields ausente, inválido o repetido.');
    return validate(doc.products.map(p => ({ id: p.id, name: p.name, barcodes: p.barcodes, ingredients_text: p.fields.find(f => f.field === 'ingredients_text')?.current ?? null, evidence: { phase: 'A', captured_date: doc.date, field_classification: p.fields.find(f => f.field === 'ingredients_text')?.classification ?? 'sin_dato' } })));
  }
  if (Array.isArray(doc) && doc.every(p => p && typeof p.id === 'string' && Object.hasOwn(p, 'ingredients_text'))) return validate(doc);
  throw new TypeError('Entrada: propuestas de fase A sin aplicar, o array con id e ingredients_text.');
}

export async function run(input, output) {
  if (!input || !output || resolve(input) === resolve(output)) throw new Error('Indicar entrada y salida nueva distintas.');
  const bytes = await readFile(input);
  if (bytes.length > 20 * 1024 * 1024) throw new Error('Entrada mayor a 20 MB; dividir en lotes locales.');
  const records = inputRecords(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, '')));
  const results = records.map(p => ({ id: p.id, name: p.name ?? null, barcodes: p.barcodes ?? [], evidence: p.evidence ?? null, ...detectText(p.ingredients_text) }));
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const report = { phase: 'B', generated_at: new Date().toISOString(), source_sha256: createHash('sha256').update(bytes).digest('hex'), source_file: input, rules_version: 'b-3', applied: false, approved_for_publication: false, scoring_changed: false, records: results.length, counts, results };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return { records: results.length, counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await run(...process.argv.slice(2)))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
