// Heurísticas de calidad (puras): marcan filas sospechosas para revisión, no corrigen.

// Patrones típicos de texto de fábrica/legal que a veces termina pegado en
// `ingredients_text` por errores de carga comunitaria en Open Food Facts —
// no es una lista de ingredientes, es la etiqueta completa mal recortada.
const BOILERPLATE_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /elaborado\s+(por|en)/i, reason: 'contiene "elaborado por/en"' },
  { pattern: /establecimiento/i, reason: 'contiene "establecimiento"' },
  { pattern: /industria\s+argentina/i, reason: 'contiene "industria argentina"' },
  { pattern: /\bRNE\b|\bRNPA\b/i, reason: 'contiene código de registro RNE/RNPA' },
  { pattern: /parque\s+industrial/i, reason: 'contiene "parque industrial"' },
  { pattern: /\bruta\s+\d+/i, reason: 'contiene referencia a ruta (dirección)' },
  { pattern: /\bcno\.?\s/i, reason: 'contiene abreviatura de "camino" (dirección)' },
  { pattern: /\b[A-Z]\d{4}[A-Z]{3}\b/, reason: 'contiene código postal argentino (CPA)' },
  { pattern: /^(www\.|https?:\/\/)/i, reason: 'empieza con una URL' },
];

export type IngredientsCheckResult = { suspect: boolean; reasons: string[] };

/** ¿`ingredients_text` parece dirección o boilerplate legal? La señal débil (pocas comas)
 *  solo suma si hay otra fuerte, así "Agua, sal" no se marca. */
export function checkIngredientsText(text: string | null | undefined): IngredientsCheckResult {
  if (!text || !text.trim()) return { suspect: false, reasons: [] };
  const reasons = BOILERPLATE_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.reason);

  const commaCount = (text.match(/,/g) ?? []).length;
  if (reasons.length > 0 && commaCount <= 1 && text.length > 60) {
    reasons.push('poca estructura de lista (casi sin comas) para el largo del texto');
  }

  return { suspect: reasons.length > 0, reasons };
}

export type IngredientsIssueRule =
  | 'rotulo'
  | 'alergenos'
  | 'conservacion'
  | 'fabricante'
  | 'sin_colesterol'
  | 'fortificacion'
  | 'sin_gluten'
  | 'unidades'
  | 'abreviatura'
  | 'parentesis'
  | 'saltos'
  | 'ins_repetido';

/** `declaracion`: texto legítimo del envase (alérgenos, "sin TACC") que no es ingrediente.
 *  `contaminacion`: texto de otra parte de la etiqueta. `estructura`: el formato del texto está roto. */
export type IngredientsIssueKind = 'declaracion' | 'contaminacion' | 'estructura';

export type IngredientsIssue = {
  rule: IngredientsIssueRule;
  kind: IngredientsIssueKind;
  fragment: string;
  start: number;
  end: number;
};

type TextRule = { rule: IngredientsIssueRule; kind: IngredientsIssueKind; pattern: RegExp };

const TEXT_RULES: TextRule[] = [
  { rule: 'rotulo', kind: 'contaminacion', pattern: /(?:^|[\r\n])\s*ingredientes\s*[:,]/giu },
  {
    rule: 'alergenos',
    kind: 'declaracion',
    pattern: /\b(?:contiene(?:n)?|puede(?:n)? contener(?: trazas de)?)\s+[^.\r\n;]+[.;]?/giu,
  },
  {
    rule: 'conservacion',
    kind: 'contaminacion',
    pattern:
      /\b(?:mantener en lugar (?:fresco|seco)|conservar refrigerado|una vez abierto|mantener refrigerado)\b[^.\r\n;]*[.;]?/giu,
  },
  {
    rule: 'fabricante',
    kind: 'contaminacion',
    pattern: /\b(?:elaborado por|elaborado en|industria argentina|RNE|RNPA|establecimiento)\b[^.\r\n;]*[.;]?/giu,
  },
  {
    rule: 'sin_colesterol',
    kind: 'declaracion',
    pattern: /\bEste producto, al igual que todos los de origen vegetal,\s*NO CONTIENE COLESTEROL\s*[.]?/giu,
  },
  { rule: 'fortificacion', kind: 'declaracion', pattern: /\bseg[uú]n la ley\b[^\r\n]*/giu },
  { rule: 'sin_gluten', kind: 'declaracion', pattern: /\b(?:sin T\.?A\.?C\.?C\.?|libre de\s+gluten)\b/giu },
  {
    rule: 'unidades',
    kind: 'contaminacion',
    pattern: /\b(?:\d+(?:[.,]\d+)?\s*)?(?:mg\s*\/\s*kg|mg\s*\/\s*100\s*g|g\s*\/\s*100\s*g)\b/giu,
  },
  // "art. a vainilla": el punto de la abreviatura parte el ingrediente en el parseo.
  { rule: 'abreviatura', kind: 'estructura', pattern: /\bart\.(?=\s)/giu },
];

function parenthesisDepthAt(text: string, position: number): number {
  let depth = 0;
  for (const char of text.slice(0, position)) {
    if (char === '(') depth++;
    if (char === ')') depth--;
  }
  return depth;
}

function hasBalancedParentheses(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

/** Texto de `ingredients_text` que no es ingrediente o está mal formado, con la posición de cada
 *  hallazgo. No decide qué hacer con la fila: las declaraciones de alérgenos son legítimas y
 *  vaciar el texto por ellas sería un error. No toca `checkIngredientsText`, que usa `etl:fix-quality`. */
export function findIngredientsTextIssues(text: string | null | undefined): IngredientsIssue[] {
  if (!text || !text.trim()) return [];
  const issues: IngredientsIssue[] = [];

  for (const { rule, kind, pattern } of TEXT_RULES) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      // "NO contiene gluten" no declara un alérgeno.
      if (rule === 'alergenos' && /\bno\s*$/iu.test(text.slice(0, start))) continue;
      // "sucralosa (5mg/100g)": una cantidad dentro del paréntesis de su ingrediente es información.
      if (
        rule === 'unidades' &&
        parenthesisDepthAt(text, start) === 1 &&
        /^\d/u.test(match[0]) &&
        /(?:^|[,;])\s*[\p{L}\p{M}][\p{L}\p{M}\s-]*\(\s*$/u.test(text.slice(0, start)) &&
        /^\s*\)/u.test(text.slice(end))
      ) {
        continue;
      }
      issues.push({ rule, kind, fragment: match[0], start, end });
    }
  }

  if (!hasBalancedParentheses(text)) {
    issues.push({ rule: 'parentesis', kind: 'estructura', fragment: text, start: 0, end: text.length });
  }
  if (/[\r\n]/u.test(text)) {
    issues.push({ rule: 'saltos', kind: 'estructura', fragment: text, start: 0, end: text.length });
  }

  const seenCodes = new Set<string>();
  for (const match of text.matchAll(/\bINS\s*(?:n[°º]?\s*)?(\d+[a-z]?)/giu)) {
    const code = match[1].toLowerCase();
    if (seenCodes.has(code)) {
      const start = match.index ?? 0;
      issues.push({ rule: 'ins_repetido', kind: 'estructura', fragment: match[0], start, end: start + match[0].length });
    }
    seenCodes.add(code);
  }
  return issues;
}

/** Una marca conocida (de otras filas) como palabra completa en `product_name`. Las más
 *  largas primero, para que "Molinos Río de la Plata" le gane a "La". */
export function findBrandInName(
  productName: string | null | undefined,
  knownBrands: string[],
): string | null {
  if (!productName) return null;
  const name = productName.toLowerCase();

  const sorted = [...new Set(knownBrands.map((b) => b.trim()).filter((b) => b.length >= 3))].sort(
    (a, b) => b.length - a.length,
  );

  for (const brand of sorted) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    if (re.test(name)) return brand;
  }
  return null;
}

// Re-export: el chequeo de rangos vive en quality/nutrientPlausibility.ts.
export {
  findImplausibleNutrients,
  findNutrientInconsistencies,
  type ImplausibleNutrient,
  type NutrientInconsistency,
} from '../quality/nutrientPlausibility';
