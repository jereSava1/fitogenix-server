// Marcas de calidad de una fila de `products` (puras). Las usa `etl:audit-quality` para dejar
// un archivo con una fila por producto. Marcar no corrige ni verifica nada.
import { hasValidGtinCheckDigit } from './barcode';
import { hasNutrientData } from './completeness';
import {
  findImplausibleNutrients,
  findIngredientsTextIssues,
  findNutrientInconsistencies,
} from './qualityHeuristics';

export type AuditInputRow = {
  id: string;
  barcode: string | null;
  product_name: string | null;
  brand: string | null;
  data_source: string | null;
  ai_enriched: boolean | null;
  ingredients_text: string | null;
  nutriments: Record<string, unknown> | null;
};

export type BarcodeStatus = 'valido' | 'longitud_no_estandar' | 'digito_malo' | 'sin_codigo';

export type AuditRecord = {
  id: string;
  barcode: string | null;
  product_name: string | null;
  data_source: string | null;
  barcode_status: BarcodeStatus;
  ai_enriched: boolean;
  sin_ingredientes: boolean;
  sin_nutrientes: boolean;
  fila_vacia: boolean;
  texto_reglas: string[];
  texto_clases: string[];
  nutrientes_fuera_de_rango: string[];
  nutrientes_relaciones: string[];
};

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

export function barcodeStatus(barcode: string | null | undefined): BarcodeStatus {
  const code = barcode?.trim();
  if (!code) return 'sin_codigo';
  if (!/^\d+$/.test(code) || !GTIN_LENGTHS.has(code.length)) return 'longitud_no_estandar';
  return hasValidGtinCheckDigit(code) ? 'valido' : 'digito_malo';
}

export function auditProduct(row: AuditInputRow): AuditRecord {
  const sinIngredientes = !row.ingredients_text || row.ingredients_text.trim() === '';
  const sinNutrientes = !hasNutrientData(row.nutriments);
  const issues = findIngredientsTextIssues(row.ingredients_text);
  const unique = (values: string[]) => [...new Set(values)];

  return {
    id: row.id,
    barcode: row.barcode,
    product_name: row.product_name,
    data_source: row.data_source,
    barcode_status: barcodeStatus(row.barcode),
    ai_enriched: row.ai_enriched === true,
    sin_ingredientes: sinIngredientes,
    sin_nutrientes: sinNutrientes,
    fila_vacia: sinIngredientes && sinNutrientes,
    texto_reglas: unique(issues.map((i) => i.rule)),
    texto_clases: unique(issues.map((i) => i.kind)),
    nutrientes_fuera_de_rango: findImplausibleNutrients(row.nutriments).map((n) => n.field),
    nutrientes_relaciones: findNutrientInconsistencies(row.nutriments).map((i) => i.rule),
  };
}

export type AuditSummary = Record<string, number>;

/** Conteos por marca. Una fila puede sumar en varias. */
export function summarizeAudit(records: AuditRecord[]): AuditSummary {
  const out: AuditSummary = { filas: records.length };
  const add = (key: string) => {
    out[key] = (out[key] ?? 0) + 1;
  };
  for (const r of records) {
    add(`codigo_${r.barcode_status}`);
    if (r.ai_enriched) add('ai_enriched');
    if (r.sin_ingredientes) add('sin_ingredientes');
    if (r.sin_nutrientes) add('sin_nutrientes');
    if (r.fila_vacia) add('fila_vacia');
    if (r.texto_reglas.length > 0) add('texto_con_hallazgos');
    for (const rule of r.texto_reglas) add(`texto_regla_${rule}`);
    if (r.texto_clases.includes('contaminacion') || r.texto_clases.includes('estructura')) {
      add('texto_contaminado_o_mal_formado');
    }
    if (r.nutrientes_fuera_de_rango.length > 0) add('nutricion_fuera_de_rango');
    if (r.nutrientes_relaciones.length > 0) add('nutricion_relacion_imposible');
    if (r.nutrientes_fuera_de_rango.length > 0 || r.nutrientes_relaciones.length > 0) {
      add('nutricion_imposible');
    }
  }
  return out;
}
