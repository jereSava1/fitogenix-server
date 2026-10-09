// Fidelidad del bloque `nutriments` de `products` frente a lo que ingresó de cada fuente
// (`products_staging`). Funciones puras: clasifican y miden, no corrigen.
import { hasNutrientData } from './completeness';

const NUTRIENTS = [
  'energy-kcal', 'energy', 'proteins', 'carbohydrates', 'sugars', 'fat', 'saturated-fat',
  'trans-fat', 'fiber', 'sodium', 'salt', 'cholesterol',
] as const;
const FOUR_MACROS = ['energy-kcal', 'proteins', 'carbohydrates', 'fat'] as const;

export type Block = Record<string, unknown> | null | undefined;

function readNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(raw)) return Number(raw);
  return null;
}

/** Valores numéricos de los nutrientes por 100 g/ml (clave sin sufijo). */
export function nutrientValues(block: Block): Map<string, number> {
  const out = new Map<string, number>();
  if (!block) return out;
  for (const key of NUTRIENTS) {
    const value = readNumber(block[`${key}_100g`] ?? block[key]);
    if (value !== null) out.set(key, value);
  }
  return out;
}

export function hasFourMacros(block: Block): boolean {
  const values = nutrientValues(block);
  return FOUR_MACROS.every((k) => values.has(k));
}

/** Igualdad de JSON sin importar el orden de las claves. */
export function sameBlock(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export type DiffCause =
  | 'conversion_x1000'
  | 'redondeo'
  | 'subconjunto_de_fuente'
  | 'superconjunto'
  | 'otra_version'
  | 'sin_claves_en_comun';

const near = (a: number, b: number) => Math.abs(a - b) <= 0.06 || Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b));
const times1000 = (a: number, b: number) =>
  (a !== 0 && b !== 0 && near(a * 1000, b)) || (a !== 0 && b !== 0 && near(a, b * 1000));

/** Por qué un bloque guardado con nutrientes reales no es el de la fuente. */
export function diffCause(stored: Block, source: Block): DiffCause {
  const s = nutrientValues(stored);
  const f = nutrientValues(source);
  const common = [...s.keys()].filter((k) => f.has(k));
  if (common.length === 0) return 'sin_claves_en_comun';
  const different = common.filter((k) => s.get(k) !== f.get(k));
  const onlyStored = [...s.keys()].filter((k) => !f.has(k)).length;
  const onlySource = [...f.keys()].filter((k) => !s.has(k)).length;
  if (different.length > 0) {
    if (different.every((k) => times1000(s.get(k) as number, f.get(k) as number))) return 'conversion_x1000';
    if (different.every((k) => near(s.get(k) as number, f.get(k) as number))) return 'redondeo';
    return 'otra_version';
  }
  if (onlyStored > 0) return 'superconjunto';
  if (onlySource > 0) return 'subconjunto_de_fuente';
  return 'otra_version';
}

export type SourceBlock = { source: string; nutriments: Block };

export type Fidelity =
  | { clase: 'A'; sub: 'igual_a_una_fuente' | 'ninguna_fuente_trae_tabla_real' }
  | { clase: 'B' }
  | { clase: 'C'; causa: DiffCause; fuente: string }
  | { clase: 'D' };

/** A: coincide con alguna fuente (o nadie trae una tabla real). B: se perdió una tabla real.
 *  C: difiere de todas sus fuentes. D: staging no tiene ningún bloque para comparar. */
export function classifyFidelity(stored: Block, sources: SourceBlock[]): Fidelity {
  const withBlock = sources.filter((s) => s.nutriments && Object.keys(s.nutriments).length > 0);
  if (withBlock.length === 0) return { clase: 'D' };
  const real = withBlock.filter((s) => hasNutrientData(s.nutriments));
  // Sin tabla real guardada: si alguna fuente la trae, se perdió, aunque lo guardado sea el bloque
  // (sin nutrientes) de otra fuente.
  if (!hasNutrientData(stored)) {
    if (real.length > 0) return { clase: 'B' };
    return withBlock.some((s) => sameBlock(stored, s.nutriments))
      ? { clase: 'A', sub: 'igual_a_una_fuente' }
      : { clase: 'A', sub: 'ninguna_fuente_trae_tabla_real' };
  }
  if (withBlock.some((s) => sameBlock(stored, s.nutriments))) return { clase: 'A', sub: 'igual_a_una_fuente' };
  // El más parecido: más claves iguales.
  const score = (s: SourceBlock) => {
    const a = nutrientValues(stored);
    const b = nutrientValues(s.nutriments);
    return [...a.keys()].filter((k) => b.get(k) === a.get(k)).length;
  };
  const best = [...real].sort((x, y) => score(y) - score(x))[0];
  if (!best) return { clase: 'D' };
  return { clase: 'C', causa: diffCause(stored, best.nutriments), fuente: best.source };
}
