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
import {
  ADDITIVE_PATTERN,
  ANNUL_GATES,
  ASCORBATE_PATTERN,
  ASCORBATE_TAGS,
  AZO_COLORANTS,
  CHILDREN_PRODUCT_PATTERN,
  DRINK_CATEGORY_PATTERN,
  FRUIT_JUICE_PATTERN,
  GENERIC_WHOLE_FOOD,
  NITRITE_PATTERN,
  NITRITE_TAGS,
  NOVA4_MARKERS,
  PROCESSED_MEAT_PATTERN,
  TIERS,
  matchWholeFoodProfile,
  matchesPhrase,
  resolveLabelAbbreviation,
  rubricImpact,
  type Impact,
  type WholeFoodProfile,
} from './scoringRubric';

// Versión del motor de scoring. Se persiste con cada fila cacheada.
// Como recomputamos el score al leer (guardamos crudos), sirve para
// métricas e invalidación selectiva, no para decidir si recomputar.
//
// v2 = rúbrica fitogenix_scoring_engine_v1.md: el puntaje ya no es un
// promedio ponderado de 4 ejes, sino base por ingredientes (§3) + modificador
// NOVA (§5) + modificador nutricional (§6), con compuertas de anulación (§4)
// que cortan antes de todo lo demás. Los umbrales de categoría también
// cambiaron (§1). Los scores de v1 NO son comparables con los de v2.
export const ENGINE_VERSION = 'ftg-rubric-v2';

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
//
// `components` son EJES DIAGNÓSTICOS, no sumandos: desde v2 el puntaje final
// sale del pipeline de §2 (base por ingredientes → NOVA → nutrición → gates),
// no de un promedio ponderado. Se mantienen porque alimentan los 4 bloques
// del popup de §7.2 y porque el payload y la app ya los consumen.
export type ScoreBreakdown = {
  score: number;
  tier: 'Excelente' | 'Bueno' | 'Moderado' | 'Malo';
  tierColor: string;
  tierMessage: string;
  gateTriggered: string | null;
  /** §11 — `false` cuando no hay lista de ingredientes: el spec dice no
   *  generar puntaje. El motor igual devuelve un número conservador para no
   *  romper el contrato de `products.score` (no nulable); el consumidor
   *  decide si mostrarlo. */
  scoreAvailable: boolean;
  /**
   * Fracción de ingredientes que el motor supo identificar (0-1), y su
   * lectura en palabras.
   *
   * Un puntaje calculado sobre 2 ingredientes reconocidos de 12 no vale lo
   * mismo que uno calculado sobre 12 de 12, pero hasta acá los dos se
   * mostraban con idéntica autoridad. Exponer la cobertura permite que la UI
   * module el mensaje —o no muestre puntaje— en vez de aparentar una
   * precisión que no tenemos.
   */
  coverage: number;
  confidence: 'alta' | 'media' | 'baja';
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
    // matchesPhrase, no includes(): "sal" no puede matchear dentro de
    // "salame" ni "ajo" dentro de "trabajo". Ver scoringRubric.matchesPhrase.
    if (matchesPhrase(n, alias)) return ing; // primer match = longest → early exit
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

// §7.2 Bloque 1 pide describir CADA ingrediente, así que ya no truncamos a 12.
// El tope acá es solo un cinturón de seguridad contra listas patológicas
// (parseos rotos de OFF con cientos de fragmentos), no una regla de producto.
const MAX_ANALYZED = 40;

/** Largo máximo de un fragmento de ingrediente. Por encima se recorta (no se
 *  descarta): es una lista corrida sin separadores, no basura. */
const MAX_FRAGMENT_LENGTH = 90;

/**
 * Texto de ingredientes de OFF → nombres individuales, limpios. Extraído para
 * que el scoring pueda razonar sobre POSICIÓN (§3.2: el azúcar pesa distinto
 * en los primeros 3 ingredientes) sin re-parsear.
 */
export function parseIngredientNames(ingredientsText?: string): string[] {
  const text = (ingredientsText || '')
    .replace(/<[^>]+>/g, '')
    // Los paréntesis se APLANAN, no se borran. El rotulado argentino declara
    // el aditivo concreto ahí adentro —"emulsionante (lecitina de soja)",
    // "colorante (E150d)"— y la versión anterior lo eliminaba, quedándose
    // solo con la categoría genérica y perdiendo el dato que importa.
    .replace(/[()[\]]/g, ',')
    // El preámbulo de marketing ("GALLETITAS DULCES CON SABOR A VAINILLA
    // RELLENAS...") puede ser largo. Antes se buscaba "Ingredientes:" solo en
    // los primeros 60 caracteres y, si no aparecía ahí, el encabezado entero
    // quedaba pegado al primer ingrediente y lo volvía inservible.
    .replace(/^[\s\S]{0,200}?\bingr(?:edientes?)?\s*[:.]+\s*/i, '');

  const seen = new Set<string>();
  const names: string[] = [];

  // Separadores: comas, puntos y coma, saltos de línea, y puntos seguidos de
  // espacio (no los decimales de "0.5 g", que quedan intactos).
  for (const raw of text.split(/[,;\r\n]|\.(?=\s|$)/)) {
    let part = raw.replace(/\*|_|\d+\.?\d*\s*%/g, '').trim();
    if (part.length <= 2) continue;

    // Un fragmento largo casi siempre es una lista corrida que no trajo
    // separadores. Antes se DESCARTABA en silencio, y con él se iban los
    // ingredientes reales del producto: unas galletitas quedaron reducidas a
    // "sulfato ferroso" y puntuaron como alimento entero. Se recorta para el
    // matching en vez de perderlo.
    if (part.length > MAX_FRAGMENT_LENGTH) part = part.slice(0, MAX_FRAGMENT_LENGTH).trim();

    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(part);
  }
  return names;
}

/** Severidad de ingredientData → nivel de impacto de la rúbrica. */
const SEV_TO_IMPACT: Record<Sev, Impact> = {
  red: 'alto', orange: 'medio', yellow: 'bajo', green: 'none', gray: 'none',
};

/**
 * Un ingrediente evaluado. `known` separa "lo reconocimos y es benigno" de
 * "no tenemos idea de qué es" — dos cosas que antes colapsaban en `'none'`.
 *
 * Esa confusión era el defecto más grave del motor: lo desconocido sumaba al
 * bonus por ingredientes reales y habilitaba el arquetipo de alimento entero,
 * así que NO SABER empujaba el puntaje hacia arriba. Un producto con tres
 * ingredientes inventados daba 80 (Excelente). §3.3 dice que un alimento
 * reconocible fuera de las listas no se penaliza, que no es lo mismo que
 * premiarlo.
 */
export type EvaluatedIngredient = {
  name: string;
  impact: Impact;
  known: boolean;
  /** Clase del aditivo si vino como abreviatura de rotulado (§8). */
  abbreviationLabel?: string;
};

/**
 * §3.2/§3.3/§8 — Impacto de un ingrediente en la posición `index`.
 *
 * Orden de precedencia:
 *  1. La rúbrica (§3.2/§8): es la autoridad cuando tiene opinión.
 *  2. §8 — abreviatura de rotulado argentino ("COL 150 d", "ACI 338").
 *  3. §3.3 — patrón de aditivo industrial sin clasificar → medio.
 *  4. ingredientData, nuestra base de 268 ingredientes. Las tablas del spec
 *     son deliberadamente parciales (§10 se propone llegar a 40-80), así que
 *     sin este respaldo el aceite de palma quedaría sin penalizar.
 *  5. Desconocido: neutro, y marcado como tal.
 */
export function evaluateIngredient(name: string, index: number): EvaluatedIngredient {
  const match = rubricImpact(name);
  if (match) {
    // §3.2 — Azúcar añadida: impacto alto en los primeros 3 ingredientes,
    // medio después ("presente pero no dominante en la formulación").
    const impact = match.positional ? (index < 3 ? 'alto' : 'medio') : match.impact;
    return { name, impact, known: true };
  }

  const abbreviation = resolveLabelAbbreviation(name);
  if (abbreviation) {
    return { name, impact: abbreviation.impact, known: true, abbreviationLabel: abbreviation.label };
  }

  // §3.3 — Número E o patrón de aditivo industrial sin clasificar → medio.
  // "La ausencia de clasificación específica no equivale a sin riesgo."
  if (ADDITIVE_PATTERN.test(name)) return { name, impact: 'medio', known: true };

  // §3.4 — El jugo de fruta pierde la fibra y la matriz: azúcar libre para la
  // OMS, penalización media aunque sea 100% exprimido.
  if (FRUIT_JUICE_PATTERN.test(name)) return { name, impact: 'medio', known: true };

  const inDatabase = classifyIngredient(name);
  if (inDatabase) return { name, impact: SEV_TO_IMPACT[inDatabase.b], known: true };

  return { name, impact: 'none', known: false };
}

/** Atajo para los casos donde solo interesa el nivel de impacto. */
export function impactOfIngredient(name: string, index: number): Impact {
  return evaluateIngredient(name, index).impact;
}

/**
 * §3.2 — La posición del azúcar decide si pesa alto o medio, pero contarla
 * sobre fragmentos crudos es frágil: en la Coca-Cola de OFF, basura de OCR
 * ("Bosas Trans", "Grasas Totales", "Planta Trelew") ocupaba las primeras
 * tres posiciones y empujaba al azúcar al índice 4, degradándola a medio.
 *
 * La posición se cuenta entonces solo sobre ingredientes RECONOCIDOS, y el
 * panel nutricional actúa de respaldo: si el azúcar declarada es alta, es
 * dominante en la formulación aunque la lista diga otra cosa. Vale la peor
 * de las dos lecturas.
 */
function evaluateIngredients(
  names: string[],
  nutriments?: Record<string, unknown>,
): { items: EvaluatedIngredient[]; sugarEscalated: boolean } {
  const items: EvaluatedIngredient[] = [];
  let recognizedIndex = 0;

  for (const name of names) {
    const evaluated = evaluateIngredient(name, recognizedIndex);
    if (evaluated.known) recognizedIndex++;
    items.push(evaluated);
  }

  const sugars = parseFloat(String(nutriments?.['sugars_100g'] ?? nutriments?.['sugars'] ?? '')) || 0;
  let sugarEscalated = false;
  if (sugars > 15) {
    for (const item of items) {
      if (item.impact === 'medio' && rubricImpact(item.name)?.positional) {
        item.impact = 'alto';
        sugarEscalated = true;
      }
    }
  }

  return { items, sugarEscalated };
}

/** Severidad mostrada en la UI, derivada del impacto de la rúbrica para que
 *  la explicación de §7.2 sea coherente con lo que efectivamente puntuó. */
function sevFromImpact(impact: Impact): Severity {
  return impact === 'alto' ? 'red' : impact === 'medio' ? 'orange' : impact === 'bajo' ? 'yellow' : 'green';
}

// ── Analyze all ingredients from OFF data ──
export function ftgAnalyzeIngredients(offProduct: ProductInput): AnalyzedIngredient[] {
  const list: AnalyzedIngredient[] = [];
  const names = parseIngredientNames(offProduct.ingredients_text);

  const { items: evaluated } = evaluateIngredients(names, offProduct.nutriments);

  evaluated.forEach(({ name: part, impact, known, abbreviationLabel }) => {
    if (list.length >= MAX_ANALYZED) return;
    const ing = classifyIngredient(part);
    const sev = sevFromImpact(impact);

    // §8 — Abreviatura de rotulado: se muestra la clase resuelta ("Colorante
    // E150", "Acidulante E338"), no el críptico "COL 150 d" de la etiqueta.
    if (abbreviationLabel) {
      list.push({
        name: abbreviationLabel,
        detail: 'Aditivo alimentario',
        sev,
        sevA: 'orange',
        amount: 'trazas',
        desc: `Declarado en la etiqueta como "${part}", la notación abreviada del rotulado argentino. Aditivo industrial: se evalúa con impacto ${impact}.`,
        flag: sev === 'red',
      });
      return;
    }

    if (ing) {
      list.push({
        name: canonicalName(ing),
        detail: '',
        // La severidad la manda la rúbrica; la descripción sigue viniendo de
        // ingredientData (es el texto que lee el usuario).
        sev,
        sevA: capaASev(ing),
        amount: '',
        desc: ing.desc,
        flag: sev === 'red',
      });
      return;
    }

    // Sin registro en ingredientData: igual entra al listado, con lo que la
    // rúbrica sepa decir de él (§3.3).
    const isAdditive = ADDITIVE_PATTERN.test(part);
    list.push({
      name: part,
      detail: isAdditive ? 'Aditivo alimentario' : '',
      sev,
      sevA: isAdditive ? 'orange' : 'yellow',
      amount: '',
      desc: isAdditive
        ? 'Aditivo industrial sin clasificación específica en nuestra base. Se evalúa con impacto medio: la falta de clasificación no equivale a ausencia de riesgo.'
        : 'No pudimos identificar este ingrediente. No suma ni resta al puntaje — no lo damos por bueno solo porque no lo conocemos.',
      flag: sev === 'red',
    });
    void known;
  });

  const addTags = offProduct.additives_tags || [];
  for (const tag of addTags) {
    if (list.length >= MAX_ANALYZED) break;
    const add: Additive | undefined = ADDITIVES[tag];
    if (!add) continue;
    const eName = add.name;
    if (list.find((i) => i.name.toLowerCase().includes(eName.toLowerCase().slice(0, 6)))) continue;
    const impact = impactOfIngredient(`${eName} ${tag.replace('en:', '')}`, 99);
    const sev = sevFromImpact(impact);
    list.push({
      name: eName,
      detail: 'Aditivo alimentario',
      sev,
      sevA: add.a ?? add.b,
      amount: 'trazas',
      desc: add.desc || `Aditivo ${eName}.`,
      flag: sev === 'red',
    });
  }

  return list;
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

// ── PASO 2 — Evaluación Fitogenix de ingredientes (§3, motor principal) ──

/** Peso de cada nivel de impacto sobre el puntaje base (§3.2). */
const IMPACT_WEIGHT: Record<Impact, number> = { alto: 10, medio: 5, bajo: 2, none: 0 };

/** Punto de partida de un producto compuesto antes de penalizar (§3.1: el
 *  producto construye su puntaje desde lo que ES). Calibrado contra la tabla
 *  de §9 — moverlo desplaza toda la banda media, así que el golden set de
 *  ftgEngine.calibration.test.ts es lo que lo mantiene honesto. */
const COMPOSITE_BASE = 71;

/**
 * Un producto de 1-2 ingredientes penalizados ES ese ingrediente — no se le
 * aplica la acumulación de un compuesto, se le asigna la banda del propio
 * ingrediente. Sin esto, "aceite de girasol" (producto de un solo
 * ingrediente) puntuaría casi igual que una galletita que lo lleva tercero,
 * y §9 pide 18-28 para el primero y 28-42 para la segunda.
 */
const DOMINANT_BAND: Record<Impact, number> = { alto: 22, medio: 54, bajo: 68, none: COMPOSITE_BASE };

/** Punto al que tiende el puntaje cuando no reconocemos los ingredientes:
 *  ni bueno ni malo, que es literalmente lo que sabemos del producto. */
const NEUTRAL_SCORE = 50;

/** Debajo de esta cobertura el puntaje no se considera afirmable (§11). */
const MIN_COVERAGE_FOR_SCORE = 0.5;

/**
 * Penalización acumulada con retornos decrecientes: el segundo ingrediente
 * problemático agrega menos que el primero, el tercero menos que el segundo.
 * Sumar linealmente hunde a cero cualquier producto con 4+ aditivos y aplana
 * toda la banda baja (un snack con 7 aditivos y uno con 15 darían lo mismo:
 * 0), que es justo lo que §9 distingue.
 */
const PENALTY_DECAY = 0.75;

function accumulatePenalties(weights: number[]): number {
  return weights
    .slice()
    .sort((a, b) => b - a)
    .reduce((total, w, i) => total + w * Math.pow(PENALTY_DECAY, i), 0);
}

export type IngredientBase = {
  base: number;
  /** Techo del arquetipo de alimento entero, si aplicó (§3.1). */
  cap: number | null;
  profile: WholeFoodProfile | null;
  evaluated: EvaluatedIngredient[];
  /** Fracción de ingredientes que el motor supo identificar (0-1). */
  coverage: number;
  /** El azúcar ya se escaló a impacto alto por el panel nutricional, así que
   *  §6 no debe volver a penalizarla ( "No duplicar"). */
  sugarEscalated: boolean;
};

/**
 * Aditivos declarados en `additives_tags` de OFF que no aparecieron en el
 * texto. Es el dato MÁS confiable que tenemos: OFF ya lo normalizó a
 * `en:e150d`, así que es inmune a la calidad del OCR del rotulado. Antes solo
 * alimentaba la lista visible y el conteo NOVA — no entraba al puntaje, con
 * lo cual un producto con el texto de ingredientes roto perdía sus aditivos.
 */
function additiveEntries(addTags: string[], fromText: EvaluatedIngredient[]): EvaluatedIngredient[] {
  const entries: EvaluatedIngredient[] = [];

  for (const tag of addTags) {
    const code = tag.replace(/^en:/, '');
    const already = fromText.some(
      (t) => matchesPhrase(t.name.toLowerCase(), code) || (ADDITIVES[tag] && matchesPhrase(t.name.toLowerCase(), ADDITIVES[tag].name.toLowerCase())),
    );
    if (already) continue;

    const byRubric = rubricImpact(code);
    entries.push({
      name: ADDITIVES[tag]?.name ?? code.toUpperCase(),
      // Un aditivo declarado que no está en la rúbrica cae al default de
      // §3.3: medio. Nunca a 'none' — que OFF lo liste ya prueba que es un
      // aditivo industrial.
      impact: byRubric ? byRubric.impact : 'medio',
      known: true,
    });
  }

  return entries;
}

/** §3 — Puntaje base del producto a partir de sus ingredientes y aditivos. */
function computeIngredientBase(
  names: string[],
  categories = '',
  addTags: string[] = [],
  nutriments?: Record<string, unknown>,
): IngredientBase {
  const { items: fromText, sugarEscalated } = evaluateIngredients(names, nutriments);
  const evaluated = [...fromText, ...additiveEntries(addTags, fromText)];

  if (evaluated.length === 0) {
    return { base: 40, cap: null, profile: null, evaluated, coverage: 0, sugarEscalated };
  }

  const coverage = evaluated.filter((e) => e.known).length / evaluated.length;
  const penalized = evaluated.filter((e) => e.impact !== 'none');
  const impacts = penalized.map((e) => e.impact);
  const allKnown = evaluated.every((e) => e.known);

  // §3.1 — Ingrediente único o mínimo: puntaje base alto por defecto. Solo si
  // ningún ingrediente penaliza Y los reconocimos a todos: no se le puede
  // adjudicar el arquetipo de "alimento entero" a una lista que no
  // entendimos.
  if (penalized.length === 0 && allKnown) {
    const declaredSugars = nutriments
      ? parseFloat(String(nutriments['sugars_100g'] ?? nutriments['sugars'] ?? '')) || 0
      : undefined;
    const profile = matchWholeFoodProfile(names, categories, declaredSugars);

    // §3.4 — Fruta en la góndola de bebidas es jugo. Un producto cuyo listado
    // dice solo "Manzana" pero cuya categoría es Bebidas no puede llevarse el
    // arquetipo de fruta entera.
    const isJuiceInDisguise =
      profile?.id === 'fruta-verdura-huevo' && DRINK_CATEGORY_PATTERN.test(categories);

    if (profile && !isJuiceInDisguise) {
      return { base: profile.base, cap: profile.max, profile, evaluated, coverage, sugarEscalated };
    }
    if (isJuiceInDisguise) {
      return {
        base: DOMINANT_BAND.medio,
        cap: null,
        profile: null,
        evaluated: [...evaluated, { name: 'Jugo de fruta', impact: 'medio', known: true }],
        coverage,
        sugarEscalated,
      };
    }
    // El mismo control cruzado que los arquetipos nombrados: un listado corto
    // y benigno desmentido por el panel no es un alimento entero.
    const sugarsContradict =
      declaredSugars != null && declaredSugars > GENERIC_WHOLE_FOOD.maxSugars;
    if (evaluated.length <= GENERIC_WHOLE_FOOD.maxIngredients && !sugarsContradict) {
      return { base: GENERIC_WHOLE_FOOD.base, cap: GENERIC_WHOLE_FOOD.max, profile: null, evaluated, coverage, sugarEscalated };
    }
  }

  // Producto que ES el ingrediente penalizado: el listado entero son 1-2
  // ingredientes. La condición va sobre el TOTAL, no sobre la cantidad de
  // penalizados: un producto de cinco ingredientes con una sola goma arábiga
  // es un compuesto con un aditivo, no "un producto de goma arábiga".
  if (penalized.length > 0 && evaluated.length <= 2) {
    const worst = impacts.includes('alto') ? 'alto' : impacts.includes('medio') ? 'medio' : 'bajo';
    return { base: DOMINANT_BAND[worst], cap: null, profile: null, evaluated, coverage, sugarEscalated };
  }

  const penalty = accumulatePenalties(impacts.map((i) => IMPACT_WEIGHT[i]));

  // §3.1 — "Un producto comienza a construir su puntaje desde lo que ES."
  // Solo suman los ingredientes que RECONOCIMOS como benignos: premiar lo
  // desconocido es exactamente el defecto que este cambio corrige. Y no suma
  // nada si hay un ingrediente de impacto alto: ese define al producto, y dos
  // ingredientes reales no lo redimen.
  const hasHighImpact = impacts.includes('alto');
  const recognizedBenign = evaluated.filter((e) => e.known && e.impact === 'none').length;
  const greenBonus = hasHighImpact ? 0 : Math.min(6, recognizedBenign * 2);

  const raw = COMPOSITE_BASE - penalty + greenBonus;

  // Regresión a neutro según cobertura. Un puntaje se construye a partir de
  // lo que encontramos; si no reconocimos casi nada, no encontramos
  // penalizaciones porque estábamos ciegos, no porque no las haya. Sostener
  // la base compuesta en ese caso es afirmar algo que no verificamos: un
  // producto con tres ingredientes ilegibles daba 63 ("Bueno").
  //
  // Con cobertura total el puntaje queda intacto; a medida que baja, tiende a
  // 50 (ni bueno ni malo). Afecta las dos direcciones a propósito: la falta
  // de datos tampoco puede usarse para condenar un producto.
  const base = clamp(NEUTRAL_SCORE + (raw - NEUTRAL_SCORE) * coverage);
  return { base, cap: null, profile: null, evaluated, coverage, sugarEscalated };
}

// ── PASO 3 — Modificador NOVA (§5) ──
// NOVA no es el motor principal: confirma o profundiza lo que los
// ingredientes ya indican. Por eso es un delta acotado y no un 25% del total
// como en v1 (donde un NOVA 4 valía -21 puntos por sí solo).
function novaModifier(nova: number | null, base: number, markerCount: number): number {
  if (nova === 1) return base >= 70 ? 6 : 0; // confirma alineación; no rescata un base bajo
  if (nova === 4) return -Math.min(15, 8 + Math.max(0, markerCount - 1));
  return 0; // NOVA 2 y 3: neutros por defecto (§5)
}

function countNova4Markers(product: ProductInput, names: string[]): number {
  const fromText = names.filter((n) => NOVA4_MARKERS.test(n)).length;
  return fromText + (product.additives_tags?.length ?? 0);
}

// ── PASO 4 — Modificador de perfil nutricional (§6) ──
// Solo resta. §6 es explícito: un perfil limpio "se asume correcto por
// defecto", sin modificador positivo. v1 daba bonus por proteína y fibra, lo
// que dejaba productos ultraprocesados fortificados por encima de comida real.
function nutritionModifier(
  product: ProductInput,
  isWholeFood: boolean,
  sugarAlreadyCounted: boolean,
): { delta: number; notes: string[] } {
  const n = product.nutriments;
  const notes: string[] = [];
  // §11 — Sin panel nutricional, se omite el paso. No asumir ni favorable ni
  // desfavorable.
  if (!n || Object.keys(n).length === 0) return { delta: 0, notes };

  const v = (k: string) => parseFloat(String(n[k + '_100g'] ?? n[k] ?? 0)) || 0;
  const sodiumMg = v('sodium') * 1000;
  const sugars = v('sugars');
  const trans = v('trans-fat');
  const isDrink = /bebida|drink|beverage|gaseosa|jugo|soda|refresco/i.test(product.categories || '');
  const sugarLimit = isDrink ? 8 : 15;

  let delta = 0;

  // Grasa trans declarada en el panel. §6 no la menciona y §4.1 solo la ataca
  // por ingrediente ("aceite parcialmente hidrogenado" en el texto), lo que
  // deja pasar cualquier producto que la declare sin nombrar el PHO: un
  // producto con 4g/100g salía Moderado y sin compuerta. Dado que §4.1
  // fundamenta la anulación en que no existe nivel de consumo seguro, no
  // penalizarla cuando está declarada sería incoherente.
  //
  // La excepción de §3.4/§4.1 se respeta: la grasa trans natural de lácteos y
  // rumiantes no se penaliza, y por eso queda fuera para alimentos enteros y
  // NOVA 1.
  if (!isWholeFood && product.nova_group !== 1 && trans > 0.2) {
    const severe = trans >= 2;
    delta -= severe ? 15 : 8;
    notes.push(`Grasa trans declarada (${trans}g/100g).`);
  }

  if (sodiumMg > 900) {
    delta -= 6;
    notes.push(`Sodio muy alto (${Math.round(sodiumMg)}mg/100g).`);
  } else if (sodiumMg > 600) {
    delta -= 3;
    notes.push(`Sodio alto (${Math.round(sodiumMg)}mg/100g).`);
  }

  // §6 + §3.4 — El azúcar natural de un alimento entero no se penaliza.
  // §6 — "La penalización ya está en los ingredientes. No duplicar." Si el
  // panel nutricional ya sirvió para escalar el azúcar del listado a impacto
  // alto, cobrarla otra vez acá la contaría dos veces.
  // La exención de azúcar natural (§3.4) se apoya en que el producto haya
  // matcheado un arquetipo de alimento entero, no en `nova_group`: ese campo
  // también es colaborativo, y bastaba un NOVA 1 mal cargado para que
  // cualquier producto azucarado esquivara la penalización. La fruta real
  // sigue exenta porque matchea su arquetipo.
  if (!sugarAlreadyCounted && !isWholeFood && sugars > sugarLimit) {
    const severe = sugars > sugarLimit * 1.5;
    delta -= severe ? 6 : 3;
    notes.push(`Azúcar alta para la categoría (${sugars}g/100g).`);
  }

  return { delta, notes };
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

// ── Gate detection (Rubric §4.2, §6) ──

/**
 * §4 — Compuertas. Las de anulación fuerzan la categoría Malo (0-24) sin
 * importar nada más y cortan la evaluación (§2, PASO 1).
 *
 * Cambios respecto de v1, todos venidos del spec: se suman E171, E127, E924 y
 * la regla de combinación de colorantes azoicos; el nitrito ahora exige
 * producto CÁRNICO PROCESADO (v1 usaba `nova_group === 4` como proxy, que
 * atrapaba cualquier ultraprocesado); y desaparecen los techos de aspartamo y
 * carragenina — §3.2 los clasifica como impacto medio, no como compuerta.
 */
function detectGates(product: ProductInput): Gate[] {
  const gates: Gate[] = [];
  const ingText = product.ingredients_text || '';
  const category = product.categories || '';
  const addTags = new Set(product.additives_tags || []);
  const has = (pattern: RegExp, tags: string[] = []) =>
    pattern.test(ingText) || tags.some((t) => addTags.has(t));

  // §4.1 — Anulaciones directas por ingrediente.
  for (const gate of ANNUL_GATES) {
    if (has(gate.pattern, gate.additiveTags)) {
      gates.push({ kind: 'annul', reason: gate.reason });
    }
  }

  // §4.1 punto 2 — Nitrito/nitrato en carne procesada.
  if (has(NITRITE_PATTERN, NITRITE_TAGS)) {
    const hasAscorbate = has(ASCORBATE_PATTERN, ASCORBATE_TAGS);
    const isProcessedMeat = PROCESSED_MEAT_PATTERN.test(`${ingText} ${category}`);

    if (isProcessedMeat && !hasAscorbate) {
      gates.push({
        kind: 'annul',
        reason:
          'Nitrito/nitrato añadido en carne procesada sin ascorbato/eritorbato protector. IARC Grupo 1 para carne procesada curada; EFSA 2023 redujo los niveles permitidos por riesgo de nitrosaminas.',
      });
    } else {
      gates.push({
        kind: 'ceiling',
        maxScore: 49,
        reason: hasAscorbate
          ? 'Contiene nitrito/nitrato añadido, con ascorbato/eritorbato que inhibe la nitrosación. Techo de puntaje: Moderado.'
          : 'Contiene nitrito/nitrato añadido como conservante. Riesgo moderado de nitrosaminas (EFSA 2023).',
      });
    }
  }

  // §4.1 punto 6 — Colorantes azoicos: anulan si hay 2 o más, o cualquiera en
  // producto dirigido a niños. Uno solo en producto no infantil ya pesa como
  // impacto alto vía IMPACT_TABLE.
  const azoPresent = AZO_COLORANTS.filter((c) => has(c.pattern, [c.tag]));
  const isChildrenProduct = CHILDREN_PRODUCT_PATTERN.test(category);
  if (azoPresent.length >= 2 || (azoPresent.length >= 1 && isChildrenProduct)) {
    gates.push({
      kind: 'annul',
      reason: `Contiene ${azoPresent.map((c) => c.name).join(', ')}${
        isChildrenProduct ? ' en un producto dirigido a niños' : ''
      }. EFSA 2008 vinculó la combinación con hiperactividad infantil; la UE exige la advertencia "puede afectar la actividad y la atención de los niños".`,
    });
  }

  return gates;
}

/**
 * §4 — "La posición exacta dentro de la banda 0-24 depende de cuántos
 * ingredientes de anulación estén presentes y de su severidad individual."
 * Calibrado contra §9: PHO 0-12, E171 0-15, nitrito sin ascorbato 0-15.
 */
function annulledScore(annulCount: number, redCount: number): number {
  let s = 12;
  s -= 4 * (annulCount - 1);
  if (redCount >= 3) s -= 3;
  else if (redCount >= 1) s -= 2;
  return Math.max(0, Math.min(24, s));
}

// ── Master scoring function (Rubric §4) ──

export function ftgScoreWithBreakdown(offProduct: ProductInput): ScoreBreakdown {
  const analyzed   = ftgAnalyzeIngredients(offProduct);
  const names      = parseIngredientNames(offProduct.ingredients_text);
  const hasIngData = ingredientCount(offProduct.ingredients_text) > 0;
  const addTags    = offProduct.additives_tags || [];

  // Ejes diagnósticos — alimentan el popup de §7.2, no suman al puntaje.
  const toxicidadScore = computeToxicityScore(analyzed, addTags);
  const nutricionScore = computeNutritionScore(offProduct);
  const novaMap: Record<number, number> = { 1: 95, 2: 75, 3: 45, 4: 10 };
  const novaFallback = addTags.length >= 5 ? 20 : addTags.length >= 2 ? 40 : hasIngData ? 58 : 40;
  const procesamientoScore = (offProduct.nova_group != null ? novaMap[offProduct.nova_group] : undefined) ?? novaFallback;

  // ── §2 PASO 1 — Compuertas de anulación, antes que nada ──
  const gates      = detectGates(offProduct);
  const annulGates = gates.filter((g) => g.kind === 'annul');
  const redCount   = analyzed.filter((i) => i.sev === 'red').length;

  // ── §2 PASO 2 — Base por ingredientes (motor principal) ──
  const { base, cap, profile, coverage, sugarEscalated } = computeIngredientBase(
    names,
    offProduct.categories,
    addTags,
    offProduct.nutriments,
  );

  // ── §2 PASO 3 — Modificador NOVA ──
  const markers  = countNova4Markers(offProduct, names);
  const novaDelta = novaModifier(offProduct.nova_group ?? null, base, markers);

  // ── §2 PASO 4 — Modificador de perfil nutricional ──
  const { delta: nutDelta, notes: nutNotes } = nutritionModifier(offProduct, profile !== null, sugarEscalated);

  // ── §2 PASO 5 — Puntaje final ──
  let score: number;
  if (annulGates.length > 0) {
    score = annulledScore(annulGates.length, redCount);
  } else {
    // El techo del arquetipo (§3.1) impide que el bonus NOVA empuje un
    // alimento entero por encima de su propia banda y rompa §9.
    const afterNova = cap != null ? Math.min(base + novaDelta, cap) : base + novaDelta;
    score = clamp(afterNova + nutDelta);
    const ceiling = Math.min(...gates.filter((g) => g.kind === 'ceiling').map((g) => (g as { maxScore: number }).maxScore));
    if (Number.isFinite(ceiling)) score = Math.min(score, ceiling);
  }

  // §1 — El puntaje determina la categoría.
  const tierDef = TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1];
  const tier = tierDef.tier;

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

  // §7.2 Bloque 3 — Solo si hay algo relevante que decir. Si todo está dentro
  // de rangos normales para la categoría, el bloque se omite (string vacío).
  const nutDetail = profile !== null || nova === 1
    ? 'Azúcares naturales del alimento entero no penalizados.'
    : nutNotes.join(' ');
  const nutVerdict = nutDelta < 0
    ? `Perfil nutricional con aspectos a mejorar (${nutDelta} puntos).`
    : 'Perfil nutricional dentro de lo esperado para la categoría.';

  // §7.2 Bloque 4 — Desde la mirada Fitogenix. Específica al producto.
  const capaBRedItems = analyzed.filter((i) => i.sev === 'red');
  const alignVerdict = annulGates.length > 0
    ? `Desde la mirada Fitogenix: ${annulGates[0].reason}`
    : capaBRedItems.length > 0
      ? `Desde la mirada Fitogenix: contiene ${capaBRedItems.slice(0, 3).map((i) => i.name).join(', ')} — no alineado con alimentación integral.`
      : profile !== null
        ? 'Desde la mirada Fitogenix: alimento entero, sin transformación industrial — exactamente lo que buscamos.'
        : base >= 65
          ? 'Desde la mirada Fitogenix: ingredientes alineados con alimentación real y mínimamente procesada.'
          : 'Desde la mirada Fitogenix: algunos ingredientes no alineados con alimentación integral.';

  // §7.2 Bloque 2 — Qué grupo NOVA es y qué significa para ESTE producto.
  const novaDetail = novaDelta === 0
    ? novaDesc
    : `${novaDesc} Modificador aplicado: ${novaDelta > 0 ? '+' : ''}${novaDelta} puntos.`;

  return {
    score,
    tier,
    tierColor:    tierDef.color,
    tierMessage:  tierDef.message,
    gateTriggered: gates.length > 0 ? gates[0].reason : null,
    // §11 — "Si no hay lista de ingredientes, no generar puntaje." Extendido
    // al caso equivalente: tener la lista pero no entenderla. Con cobertura
    // baja el número que devolvemos es una estimación, no un veredicto, y el
    // consumidor tiene que poder distinguirlo.
    scoreAvailable: hasIngData && coverage >= MIN_COVERAGE_FOR_SCORE,
    coverage: Math.round(coverage * 100) / 100,
    confidence: coverage >= 0.8 ? 'alta' : coverage >= 0.5 ? 'media' : 'baja',
    components: {
      toxicidad:     { score: toxicidadScore,     verdict: toxVerdict,   detail: toxDetail  },
      nutricion:     { score: nutricionScore,     verdict: nutVerdict,   detail: nutDetail  },
      procesamiento: { score: procesamientoScore, nova,                  detail: novaDetail },
      alineacion:    { score: base,               verdict: alignVerdict, detail: ''         },
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
