/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Ingredient classification & scoring engine
   Rubric v1 — Two-layer system (Capa A / Capa B)

   Pure logic, zero React Native / Expo imports — runs identically
   inside the app and in standalone Node scripts. Keeping this
   framework-agnostic is what lets the curation tooling reuse the
   exact same scoring as a live scan.

   La base de datos de ingredientes/aditivos vive en ingredientData.ts
   (un registro por ingrediente, con Capa A y Capa B juntas). Este
   archivo solo tiene la lógica: matching, clasificación y scoring.
═══════════════════════════════════════════════════════════ */

import {
  ADDITIVES,
  INGREDIENTS,
  type Additive,
  type Ingredient,
  type Sev,
} from './ingredientData';

// ── Types ──
export type Severity = Sev;

export type AnalyzedIngredient = {
  name: string;
  detail: string;
  sev: Severity;   // Capa B (Fitogenix) — la que se muestra en la UI
  sevA: Severity;  // Capa A (regulatoria) — = sev si no diverge; usada por el scoring de toxicidad
  amount: string;
  desc: string;
  flag: boolean;
};

export type NutritionFacts = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  sugars: number | null;
  fats: number | null;
  satFats: number | null;
  sodium: number | null;
  fiber: number | null;
  transFat: number | null;
  cholesterol: number | null;
};

// Minimal shape the engine needs — satisfied structurally by both
// RawOFFProduct and the plain objects the curation scripts build.
export type ProductInput = {
  ingredients_text?: string;
  nutriments?: Record<string, unknown>;
  nova_group?: number;
  additives_tags?: string[];
  labels_tags?: string[];
  categories?: string;
  image_url?: string;
  image_front_url?: string;
};

// ── Score breakdown type (Rubric §4, §7) ──
export type ScoreBreakdown = {
  score: number;
  tier: 'Excelente' | 'Bueno' | 'Moderado' | 'Malo';
  tierColor: string;
  tierMessage: string;
  gateTriggered: string | null;
  components: {
    toxicidad:     { score: number; verdict: string; detail: string };
    nutricion:     { score: number; verdict: string; detail: string };
    procesamiento: { score: number; nova: number | null; detail: string };
    alineacion:    { score: number; verdict: string; detail: string };
  };
};

// Internal gate type — never exported.
type Gate =
  | { kind: 'annul';   reason: string }
  | { kind: 'ceiling'; maxScore: number; reason: string };

// ── Matching index — built once at module load ──
// Todos los aliases aplanados a [alias, ingredient], ordenados por longitud
// descendente. Así el PRIMER alias que sea substring del nombre es siempre el
// más largo (longest-match), y podemos hacer early-exit en lugar de recorrer
// los 268 ingredientes en cada clasificación.
type IndexEntry = { alias: string; ing: Ingredient };
const INGREDIENT_INDEX: IndexEntry[] = INGREDIENTS
  .flatMap((ing) => ing.aliases.map((alias) => ({ alias: alias.toLowerCase(), ing })))
  .sort((a, b) => b.alias.length - a.alias.length);

// ── Core: classify a single ingredient name → its full Ingredient record ──
// Un solo lookup devuelve Capa A y Capa B juntas (antes eran dos recorridos
// separados: ftgClassifyOne + getCapaASevFromName).
function classifyIngredient(name: string): Ingredient | null {
  const n = name.toLowerCase().trim();
  for (const { alias, ing } of INGREDIENT_INDEX) {
    if (n.includes(alias)) return ing; // primer match = longest → early exit
  }
  return null;
}

// Capa A severity de un ingrediente ya clasificado (= Capa B si no diverge).
function capaASev(ing: Ingredient): Severity {
  return ing.a ?? ing.b;
}

// Nombre a mostrar: el primer alias es siempre el canónico en español
// (los aliases en inglés se agregan después), capitalizado. Así un producto
// de OFF con "PALM OIL" se muestra como "Aceite de palma".
function canonicalName(ing: Ingredient): string {
  const es = ing.aliases[0];
  return es.charAt(0).toUpperCase() + es.slice(1);
}

// ── Analyze all ingredients from OFF data ──
export function ftgAnalyzeIngredients(offProduct: ProductInput): AnalyzedIngredient[] {
  const list: AnalyzedIngredient[] = [];
  const seen = new Set<string>();

  const text = (offProduct.ingredients_text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/^.{0,60}?\bingr(?:edientes?)?\s*[:.]+\s*/i, '');
  const parts = text
    .split(/[,;]/)
    .map((s) => s.replace(/\*|_|\d+\.?\d*\s*%/g, '').trim())
    .filter((s) => s.length > 2 && s.length < 80);

  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const ing = classifyIngredient(part);
    if (ing) {
      list.push({
        name: canonicalName(ing),
        detail: '',
        sev: ing.b,
        sevA: capaASev(ing),
        amount: '',
        desc: ing.desc,
        flag: ing.b === 'red',
      });
    } else {
      const lp = part.toLowerCase();
      const isENumber = /\be\d{3,4}\b/.test(lp);
      if (!isENumber && lp.length > 3) {
        list.push({
          name: part,
          detail: '',
          sev: 'yellow',
          sevA: 'yellow',
          amount: '',
          desc: 'Sin clasificación en nuestra base de datos. Verificar origen.',
          flag: false,
        });
      }
    }
    if (list.length >= 12) break;
  }

  const addTags = offProduct.additives_tags || [];
  for (const tag of addTags) {
    const add: Additive | undefined = ADDITIVES[tag];
    if (!add) continue;
    const eName = add.name;
    if (list.find((i) => i.name.toLowerCase().includes(eName.toLowerCase().slice(0, 6)))) continue;
    list.push({
      name: eName,
      detail: 'Aditivo alimentario',
      sev: add.b,
      sevA: add.a ?? add.b,
      amount: 'trazas',
      desc: add.desc || `Aditivo ${eName}.`,
      flag: add.b === 'red',
    });
    if (list.length >= 14) break;
  }

  return list.slice(0, 12);
}

export function ingredientCount(txt?: string): number {
  if (!txt || txt.trim().length < 3) return 0;
  return txt.split(/[,;]/).filter((s) => s.trim().length > 1).length;
}

// ── Two-layer score components (Rubric §4) ──

function computeToxicityScore(analyzed: AnalyzedIngredient[], addTags: string[]): number {
  // Capa A only: uses regulatory evidence (ing.sevA, ya clasificado).
  let base = analyzed.length > 0 ? 80 : 50;
  let redCount = 0, orangeCount = 0;

  for (const ing of analyzed) {
    if      (ing.sevA === 'red')    { redCount++;    base -= 20; }
    else if (ing.sevA === 'orange') { orangeCount++; base -= 8; }
    else if (ing.sevA === 'yellow') { base -= 2; }
    // green: no deduction
  }

  // Aditivos E-number con override Capa A explícito que no estén ya en analyzed.
  for (const tag of addTags) {
    const add = ADDITIVES[tag];
    if (!add?.a) continue; // solo donde Capa A diverge de Capa B
    if (add.name && analyzed.find((i) => i.name.toLowerCase().includes(add.name.toLowerCase().slice(0, 6)))) continue;
    if      (add.a === 'red')    { redCount++;    base -= 20; }
    else if (add.a === 'orange') { orangeCount++; base -= 8; }
  }

  if (analyzed.length <= 5 && redCount === 0 && orangeCount === 0) base += 10;

  return Math.max(0, Math.min(100, Math.round(base)));
}

function computeNutritionScore(product: ProductInput): number {
  // NOVA-aware: natural sugars and saturated fat in NOVA 1 foods are not penalized (§5.1, §5.2).
  const n = product.nutriments || {};
  const v = (k: string) => parseFloat(String(n[k + '_100g'] ?? n[k] ?? 0)) || 0;
  const nova = product.nova_group;

  const sugars  = v('sugars');
  const satFat  = v('saturated-fat');
  const trans   = v('trans-fat');
  const sodium  = v('sodium') * 1000;
  const protein = v('proteins');
  const fiber   = v('fiber');

  let base = 65;

  if (trans > 0.2) base -= 25;

  if (nova !== 1) {
    if      (sugars > 25) base -= 25;
    else if (sugars > 15) base -= 15;
    else if (sugars > 8)  base -= 8;
    else if (sugars < 3)  base += 8;
  }

  if (nova !== 1) {
    if      (satFat > 15) base -= 20;
    else if (satFat > 10) base -= 12;
    else if (satFat > 5)  base -= 6;
    else if (satFat < 3)  base += 5;
  }

  if      (sodium > 900) base -= 20;
  else if (sodium > 600) base -= 12;
  else if (sodium > 300) base -= 6;
  else if (sodium < 100) base += 5;

  if      (protein > 20) base += 15;
  else if (protein > 12) base += 10;
  else if (protein > 6)  base += 5;

  if      (fiber > 8) base += 15;
  else if (fiber > 5) base += 10;
  else if (fiber > 2) base += 5;

  return Math.max(0, Math.min(100, Math.round(base)));
}

function computeAlignmentScore(analyzed: AnalyzedIngredient[], ingText?: string): number {
  // Capa B: Fitogenix philosophy — ingredient-level alignment (usa ing.sev).
  const hasData = (ingText || '').trim().length > 3;
  let base = hasData ? 72 : 40;

  for (const ing of analyzed) {
    if      (ing.sev === 'red')    { base -= 14; }
    else if (ing.sev === 'orange') { base -= 5; }
    else if (ing.sev === 'yellow') { base -= 1; }
    else if (ing.sev === 'green')  { base += 2; }
  }

  // Penalize if a philosophically "bad" ingredient appears first in the list.
  const firstIng = (ingText || '').replace(/\([^)]*\)/g, '').split(/[,;]/)[0]?.toLowerCase() || '';
  const badFirst = ['azúcar','sugar','jarabe','fructosa','dextrosa','aceite de girasol','sunflower oil','aceite de soja','soybean oil','aceite vegetal','vegetable oil','grasa vegetal'];
  if (badFirst.some((k) => firstIng.includes(k))) base -= 10;

  return Math.max(0, Math.min(100, Math.round(base)));
}

// ── Gate detection (Rubric §4.2, §6) ──

function detectGates(product: ProductInput, _analyzed: AnalyzedIngredient[]): Gate[] {
  const gates: Gate[] = [];
  const ingText = (product.ingredients_text || '').toLowerCase();
  const addTags = new Set(product.additives_tags || []);

  // Gate 1 — Industrial trans fat: anulación total (§6.5)
  if (/parcialmente\s+hidrogenado|aceite\s+hidrogenado|grasa\s+hidrogenada|partially\s+hydrogenated|hydrogenated\s+oil/.test(ingText)) {
    gates.push({
      kind: 'annul',
      reason: 'Contiene aceite parcialmente hidrogenado (grasa trans industrial). Consenso científico y regulatorio unánime — OMS solicita eliminación global desde 2018. Sin nivel de consumo seguro.',
    });
  }

  // Gate 2 — Nitrito/Nitrato (§6.1)
  const nitriteE = ['en:e249','en:e250','en:e251','en:e252'];
  const hasNitrite = nitriteE.some((e) => addTags.has(e)) ||
    /nitrito\s+de\s+sodio|nitrato\s+de\s+sodio|sodium\s+nitrite|sodium\s+nitrate/.test(ingText);

  if (hasNitrite) {
    const ascorbateE = ['en:e300','en:e301','en:e315','en:e316'];
    const hasAscorbate = ascorbateE.some((e) => addTags.has(e)) ||
      /ascorbato|ácido\s+ascórbico|eritorbato|ascorbic\s+acid|erythorbate/.test(ingText);
    const nova = product.nova_group;

    if (nova === 4 && !hasAscorbate) {
      gates.push({
        kind: 'annul',
        reason: 'Nitrito/nitrato añadido en producto NOVA 4 sin ascorbato protector. IARC Grupo 2A; EFSA 2023 redujo niveles permitidos por riesgo de nitrosaminas cancerígenas.',
      });
    } else {
      gates.push({
        kind: 'ceiling',
        maxScore: 49,
        reason: 'Contiene nitrito/nitrato añadido como conservante. Riesgo moderado de nitrosaminas (EFSA 2023, IARC Grupo 2A).',
      });
    }
  }

  // Gate 3 — Aspartame: techo 49 (§6.3)
  if (addTags.has('en:e951') || /aspartamo|aspartame/.test(ingText)) {
    gates.push({
      kind: 'ceiling',
      maxScore: 49,
      reason: 'Contiene aspartamo (E951). IARC Grupo 2B (2023, evidencia limitada sobre peligro; JECFA reafirmó IDA de 40mg/kg tras evaluar datos humanos).',
    });
  }

  // Gate 4 — Carrageenan: techo 49 (§6.4)
  if (addTags.has('en:e407') || addTags.has('en:e407a') || /carragenina|carragenano|carrageenan/.test(ingText)) {
    gates.push({
      kind: 'ceiling',
      maxScore: 49,
      reason: 'Contiene carragenina (E407). EFSA mantiene reevaluación activa desde 2018 con preguntas sin resolver sobre efectos intestinales.',
    });
  }

  return gates;
}

function applyGatesToScore(rawScore: number, gates: Gate[], redCount: number): number {
  let annulCount = 0;
  let minCeiling = Infinity;

  for (const gate of gates) {
    if (gate.kind === 'annul') {
      annulCount++;
    } else {
      minCeiling = Math.min(minCeiling, gate.maxScore);
    }
  }

  if (annulCount > 0) {
    let s = 20;
    if (annulCount >= 2) s -= 8;
    if (redCount >= 3)   s -= 6;
    else if (redCount >= 1) s -= 3;
    return Math.max(0, Math.min(24, s));
  }

  if (minCeiling < Infinity) return Math.min(rawScore, minCeiling);

  return rawScore;
}

// ── Master scoring function (Rubric §4) ──

export function ftgScoreWithBreakdown(offProduct: ProductInput): ScoreBreakdown {
  const analyzed   = ftgAnalyzeIngredients(offProduct);
  const hasIngData = ingredientCount(offProduct.ingredients_text) > 0;
  const addTags    = offProduct.additives_tags || [];

  const toxicidadScore = computeToxicityScore(analyzed, addTags);
  const nutricionScore = computeNutritionScore(offProduct);

  const novaMap: Record<number, number> = { 1: 95, 2: 75, 3: 45, 4: 10 };
  const addCount = addTags.length;
  const novaFallback = addCount >= 5 ? 20 : addCount >= 2 ? 40 : hasIngData ? 58 : 40;
  const procesamientoScore = (offProduct.nova_group != null ? novaMap[offProduct.nova_group] : undefined) ?? novaFallback;

  const alineacionScore = computeAlignmentScore(analyzed, offProduct.ingredients_text);

  const rawScore = Math.max(1, Math.min(100, Math.round(
    toxicidadScore     * 0.35 +
    nutricionScore     * 0.25 +
    procesamientoScore * 0.25 +
    alineacionScore    * 0.15,
  )));

  const gates    = detectGates(offProduct, analyzed);
  const redCount = analyzed.filter((i) => i.sev === 'red').length;
  const score    = applyGatesToScore(rawScore, gates, redCount);

  // Umbrales alineados con la spec de negocio Fitogenix:
  // 85+ Excelente · 70-84 Bueno · 50-69 Moderado · <50 Malo.
  const tier: ScoreBreakdown['tier'] =
    score >= 85 ? 'Excelente' :
    score >= 70 ? 'Bueno'     :
    score >= 50 ? 'Moderado'  : 'Malo';

  const TIER_COLORS:   Record<string, string> = { Excelente: '#16a34a', Bueno: '#84cc16', Moderado: '#f97316', Malo: '#dc2626' };
  const TIER_MESSAGES: Record<string, string> = { Excelente: 'Lo recomendamos', Bueno: 'Buena opción', Moderado: 'Consúmelo con consciencia', Malo: 'No lo recomendamos' };

  const nova = offProduct.nova_group ?? null;
  const novaDesc =
    nova === 1 ? 'NOVA 1 — Alimento sin procesar o mínimamente procesado.' :
    nova === 2 ? 'NOVA 2 — Ingrediente culinario procesado. Uso tradicional.' :
    nova === 3 ? 'NOVA 3 — Alimento procesado. Sal, azúcar u otros ingredientes añadidos.' :
    nova === 4 ? 'NOVA 4 — Producto ultraprocesado. Múltiples aditivos de uso industrial.' :
                 'Clasificación NOVA no disponible.';

  // Capa A (Toxicidad) — usa sevA ya clasificado
  const capaARedItems = analyzed.filter((i) => i.sevA === 'red');
  const toxVerdict = capaARedItems.length > 0
    ? `${capaARedItems.map((i) => i.name).join(', ')} — evidencia regulatoria de riesgo.`
    : toxicidadScore >= 75
      ? 'Sin ingredientes con evidencia regulatoria de riesgo.'
      : 'Ingredientes con señales de precaución moderada.';
  const toxDetail = gates.length > 0 ? gates[0].reason : '';

  const nutDetail = nova === 1
    ? 'Azúcares y grasas saturadas naturales no penalizadas (alimento entero, NOVA 1).'
    : '';
  const nutVerdict =
    nutricionScore >= 70 ? 'Perfil nutricional favorable.' :
    nutricionScore >= 50 ? 'Perfil nutricional aceptable.' :
    'Perfil nutricional con aspectos a mejorar (azúcar, sodio o grasas saturadas elevados).';

  // Capa B (Alineación Fitogenix) — usa sev
  const capaBRedItems = analyzed.filter((i) => i.sev === 'red');
  const alignVerdict = capaBRedItems.length > 0
    ? `Desde la mirada Fitogenix: contiene ${capaBRedItems.slice(0, 3).map((i) => i.name).join(', ')} — no alineado con alimentación integral.`
    : alineacionScore >= 65
      ? 'Desde la mirada Fitogenix: ingredientes alineados con alimentación real y mínimamente procesada.'
      : 'Desde la mirada Fitogenix: algunos ingredientes no alineados con alimentación integral.';

  return {
    score,
    tier,
    tierColor:    TIER_COLORS[tier],
    tierMessage:  TIER_MESSAGES[tier],
    gateTriggered: gates.length > 0 ? gates[0].reason : null,
    components: {
      toxicidad:     { score: toxicidadScore,     verdict: toxVerdict,   detail: toxDetail },
      nutricion:     { score: nutricionScore,     verdict: nutVerdict,   detail: nutDetail },
      procesamiento: { score: procesamientoScore, nova,                  detail: novaDesc  },
      alineacion:    { score: alineacionScore,    verdict: alignVerdict, detail: ''        },
    },
  };
}

// ── Fitogenix Score: single number (delegates to ftgScoreWithBreakdown) ──
export function ftgScore(offProduct: ProductInput): number {
  return ftgScoreWithBreakdown(offProduct).score;
}

// ── Extract nutrition facts from OFF nutriments ──
export function extractNutrition(nutriments?: Record<string, unknown>): NutritionFacts {
  const empty: NutritionFacts = {
    calories: null, protein: null, carbs: null, sugars: null, fats: null,
    satFats: null, sodium: null, fiber: null, transFat: null, cholesterol: null,
  };
  if (!nutriments) return empty;
  const v = (k: string): number | null => {
    const raw = nutriments[k + '_100g'] ?? nutriments[k];
    if (raw == null || isNaN(Number(raw))) return null;
    return Math.round(parseFloat(String(raw)) * 10) / 10;
  };
  const sodium = v('sodium');
  const cholesterol = v('cholesterol');
  return {
    calories: v('energy-kcal'),
    protein: v('proteins'),
    carbs: v('carbohydrates'),
    sugars: v('sugars'),
    fats: v('fat'),
    satFats: v('saturated-fat'),
    sodium: sodium != null ? Math.round(sodium * 1000) : null,
    fiber: v('fiber'),
    transFat: v('trans-fat'),
    cholesterol: cholesterol != null ? Math.round(cholesterol * 1000) : null,
  };
}

// ── Extract category ──
export function extractCategory(categoriesStr?: string): string {
  if (!categoriesStr) return 'Alimento';
  const parts = categoriesStr.split(',').map((s) => s.trim());
  const short = parts.find((p) => p.split(':').pop()!.length < 30);
  if (!short) return parts[0] || 'Alimento';
  return short.split(':').pop()!.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
