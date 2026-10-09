// Planes de la purga de `products` (puros). Cada plan lista las filas a tocar con los valores
// de antes y de después; el job aplica solo lo que está en el plan revisado.
import { hasNutrientData } from './completeness';
import { findImplausibleNutrients, findNutrientInconsistencies } from './qualityHeuristics';

export type PurgeRow = {
  id: string;
  barcode: string | null;
  data_source: string | null;
  ai_enriched: boolean | null;
  ingredients_text: string | null;
  nutriments: Record<string, unknown> | null;
  additives_tags: unknown;
};

export type PlannedChange = {
  id: string;
  barcode: string | null;
  reason: string;
  /** Solo las columnas que cambian, con el valor que tienen hoy. */
  before: Record<string, unknown>;
  /** Esas mismas columnas, con el valor nuevo. */
  after: Record<string, unknown>;
};

/** Ola 1: vaciar lo que escribió la IA. Sin esto, el merge lo tomaría como fuente `existing`. */
export function planAiCleanup(rows: PurgeRow[]): PlannedChange[] {
  return rows
    .filter((r) => r.ai_enriched === true)
    .map((r) => ({
      id: r.id,
      barcode: r.barcode,
      reason: 'dato generado por IA (ai_enriched)',
      before: {
        ingredients_text: r.ingredients_text,
        nutriments: r.nutriments,
        additives_tags: r.additives_tags ?? null,
      },
      after: { ingredients_text: null, nutriments: null, additives_tags: null },
    }));
}

/** Un valor de `nutriments` cambiado en una sola fila, buscada por código de barras. */
export function planNutrimentValue(
  rows: PurgeRow[],
  barcode: string,
  key: string,
  from: number,
  to: number,
  reason: string,
): PlannedChange[] {
  const matches = rows.filter((r) => r.barcode === barcode);
  if (matches.length !== 1) throw new Error(`se esperaba 1 fila con código ${barcode} y hay ${matches.length}`);
  const [row] = matches;
  if (row.nutriments?.[key] !== from) {
    throw new Error(`${barcode}: ${key} vale ${String(row.nutriments?.[key])} y se esperaba ${from}`);
  }
  return [
    {
      id: row.id,
      barcode,
      reason,
      before: { nutriments: row.nutriments },
      after: { nutriments: { ...row.nutriments, [key]: to } },
    },
  ];
}

/** Ola 3: ¿la tabla tiene valores fuera de rango o relaciones imposibles? */
export function hasImpossibleNutrition(nutriments: Record<string, unknown> | null | undefined): boolean {
  return findImplausibleNutrients(nutriments).length > 0 || findNutrientInconsistencies(nutriments).length > 0;
}

export type BlockDecision =
  | { action: 'reemplazar'; nutriments: Record<string, unknown> }
  | { action: 'vaciar'; motivo: string };

/** Ola 3: qué hacer con el bloque de una fila imposible, dado lo que hoy publica su fuente.
 *  Un bloque coherente reemplaza al entero; si no hay o no es coherente, se vacía. Nunca se mezcla. */
export function decideNutritionBlock(
  fromSource: Record<string, unknown> | null | undefined,
): BlockDecision {
  if (!fromSource || !hasNutrientData(fromSource)) {
    return { action: 'vaciar', motivo: 'la fuente no trae tabla nutricional' };
  }
  if (hasImpossibleNutrition(fromSource)) {
    return { action: 'vaciar', motivo: 'la fuente trae una tabla con valores imposibles' };
  }
  return { action: 'reemplazar', nutriments: fromSource };
}

export function planNutritionBlock(
  row: PurgeRow,
  decision: BlockDecision,
  sourceLabel: string,
): PlannedChange {
  const after = decision.action === 'reemplazar' ? decision.nutriments : null;
  const reason =
    decision.action === 'reemplazar'
      ? `nutrición imposible; la fuente (${sourceLabel}) trae un bloque coherente`
      : `nutrición imposible; se vacía el bloque: ${decision.motivo} (${sourceLabel})`;
  return {
    id: row.id,
    barcode: row.barcode,
    reason,
    before: { nutriments: row.nutriments },
    after: { nutriments: after },
  };
}
