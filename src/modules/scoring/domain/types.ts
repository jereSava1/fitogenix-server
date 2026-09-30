// Todas las formas del dominio del motor, sin lógica ni dependencias.

/* ────────────────────────────────────────────────────────────
   Impacto y niveles (§2 Paso 2, §4)
   ──────────────────────────────────────────────────────────── */

/** §2 Paso 2: niveles de impacto, más `none` (reconocido, sin objeción) y `desconocido` (no
 *  se sabe qué es: costo propio y techo). No saber nunca empuja el puntaje hacia arriba. */
export type Impact = 'alto' | 'medio' | 'bajo' | 'none' | 'desconocido';

/** Severidad que se muestra en la UI. Se deriva del impacto, nunca al revés. */
export type Severity = 'red' | 'orange' | 'yellow' | 'green' | 'gray';

/** §2 Paso 2 — Cuánto resta un impacto según dónde caiga el ingrediente. */
export interface DeductionRates {
  /** Entre los primeros 3 ingredientes de la lista limpia. */
  readonly first3: number;
  /** Del 4º en adelante. */
  readonly rest: number;
}

/* ────────────────────────────────────────────────────────────
   La rúbrica como datos (§1, §3, §4, §5)
   ──────────────────────────────────────────────────────────── */

/** §4: una fila de la tabla de ingredientes. */
export interface ImpactEntry {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly impact: Impact;
  /** §2 Paso 3 — ⚑ marcador de ultraprocesado. */
  readonly marker?: boolean;
  /** §4.2 — Ancla como producto puro, Alto como ingrediente añadido. */
  readonly traditionalSugar?: boolean;
  /** §4.4 — Cuenta para el techo de "proteína mayormente aislada". */
  readonly isolatedProtein?: boolean;
  /** §4.5 — Fortificación exigida por el CAA: nunca penaliza. */
  readonly mandatoryFortification?: boolean;
  /** Justificación pre-escrita. §7 prohíbe cualquier otra. */
  readonly desc?: string;
}

/** §3: una fila de anclas. Terminal: si la lista cabe en la fila, ese es el puntaje. */
export interface Anchor {
  readonly id: string;
  readonly label: string;
  /** Extremos del rango que declara el documento. */
  readonly min: number;
  readonly max: number;
  /** Al menos uno de estos tiene que estar presente… */
  readonly required: readonly string[];
  /** …o todos los términos de algún conjunto: un yogur declara "leche, fermentos" y nunca
   *  dice "yogur". */
  readonly requiredAll?: readonly (readonly string[])[];
  /** Además de lo anterior, solo estos pueden aparecer. */
  readonly allowed: readonly string[];
  /** La categoría delata el arquetipo aunque el listado no lo nombre. */
  readonly categoryPattern?: RegExp;
  /** Tope de ingredientes por fila (algunas anclas tienen 3-5 componentes). */
  readonly maxIngredients: number;
  /** Si el panel desmiente al listado, el ancla no aplica. */
  readonly maxSugars?: number;
}

/** §5 — Una compuerta de anulación. */
export interface AnnulGate {
  readonly id: string;
  readonly pattern: RegExp;
  /** Tags de aditivo de la base que también la disparan. */
  readonly additiveTags?: readonly string[];
  readonly reason: string;
}

/** §5.6 — Colorante azoico con advertencia obligatoria en la UE. */
export interface AzoColorant {
  readonly name: string;
  readonly pattern: RegExp;
  readonly tag: string;
}

/** §1.1 — Categoría fuera del alcance de Fitogenix. */
export interface OutOfScopeRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly message: string;
}

/** §2 — Una banda de puntaje con su presentación. */
export interface TierDefinition {
  readonly min: number;
  readonly tier: Tier;
  readonly color: string;
  readonly message: string;
}

/* ────────────────────────────────────────────────────────────
   Consultas sobre la rúbrica (matching)
   ──────────────────────────────────────────────────────────── */

/** Una sustancia de la rúbrica encontrada dentro de un fragmento de texto. */
export interface RubricMatch {
  readonly term: string;
  readonly impact: Impact;
  readonly marker: boolean;
  readonly entry: ImpactEntry;
  /** Tramo del texto que ocupa, para que dos términos no se pisen. */
  readonly start: number;
  readonly end: number;
}

/** El veredicto de la rúbrica sobre un fragmento: el PEOR de sus términos. */
export interface ImpactMatch {
  readonly impact: Impact;
  readonly marker: boolean;
  readonly entry: ImpactEntry;
  /** El término que decidió el impacto. El nombre mostrado sale de acá. */
  readonly term: string;
}

/** §8 — Una abreviatura del rotulado argentino resuelta ("COL 150 d"). */
export interface AbbreviationMatch {
  readonly label: string;
  readonly impact: Impact;
  readonly marker: boolean;
}

/** §3 — Ancla que cubre la lista entera, con su puntaje determinista. */
export interface AnchorMatch {
  readonly anchor: Anchor;
  readonly score: number;
}

/* ────────────────────────────────────────────────────────────
   §6 — La lista limpia
   ──────────────────────────────────────────────────────────── */

/** Un ingrediente después de limpiar la etiqueta, antes de clasificarlo. */
export interface CleanIngredient {
  /** Texto como quedó tras limpiar — es lo que ve el usuario. */
  readonly raw: string;
  /** Normalizado (minúsculas, sin acentos) — es lo que se matchea. */
  readonly key: string;
  /** §2 Paso 2 — posición 1-indexed sobre la lista YA limpia y aplanada. */
  readonly position: number;
  /** Porcentaje declarado en la etiqueta, para la regla de dominancia (§3). */
  readonly percent?: number;
  /** §6.4 — las alternativas de un "y/o". */
  readonly alternatives?: readonly string[];
  /** Venía dentro de un paréntesis: es componente de una sub-lista. */
  readonly nested?: boolean;
}

export interface CleanedList {
  readonly items: readonly CleanIngredient[];
  /** §6.1 — se muestran aparte: no puntúan ni anulan. */
  readonly allergenWarnings: readonly string[];
  /** §4.7 — certificaciones sacadas. Si no queda nada, "Sin datos". */
  readonly certificationsRemoved: readonly string[];
}

/* ────────────────────────────────────────────────────────────
   Clasificación
   ──────────────────────────────────────────────────────────── */

/** Un ingrediente limpio, ya clasificado. Es la unidad de puntuación. */
export interface EvaluatedIngredient {
  readonly item: CleanIngredient;
  /** Nombre a mostrar: canónico en español cuando lo tenemos. */
  readonly display: string;
  readonly impact: Impact;
  readonly marker: boolean;
  /** `false` solo cuando cayó en NO IDENTIFICADO (§4.7). */
  readonly known: boolean;
  readonly desc: string;
  readonly detail?: string;
  /** §4.4 — cuenta para el techo de proteína aislada. */
  readonly isolatedProtein: boolean;
  /** §4.5 — fortificación obligatoria: nunca penaliza. */
  readonly mandatory: boolean;
}

/** Una regla de clasificación: `null` si no tiene opinión y pasa a la siguiente. */
export type IngredientResolver = (item: CleanIngredient) => EvaluatedIngredient | null;

/* ────────────────────────────────────────────────────────────
   §2 — El desglose
   ──────────────────────────────────────────────────────────── */

export type ScoreStepKind =
  | 'base'
  | 'ancla'
  | 'ingrediente'
  | 'procesamiento'
  | 'nutricion'
  | 'techo'
  | 'anulacion'
  | 'clamp';

/** Una fila de la cuenta. `delta` es `null` en los pasos que fijan un valor. */
export interface ScoreStep {
  readonly kind: ScoreStepKind;
  readonly label: string;
  readonly delta: number | null;
  /** Puntaje después de aplicar este paso. */
  readonly running: number;
  readonly detail?: string;
}

/** §2 Paso 4 — Un techo candidato, con el motivo que el usuario va a leer. */
export interface Ceiling {
  readonly value: number;
  readonly reason: string;
}

/* ────────────────────────────────────────────────────────────
   §1 — Cuándo no se puntúa
   ──────────────────────────────────────────────────────────── */

export type NoScoreCode =
  | 'fuera-de-alcance'
  | 'no-alimentario'
  | 'sin-ingredientes'
  | 'solo-categorias'
  | 'sin-identificar'
  | 'solo-certificaciones';

export interface NoScore {
  readonly code: NoScoreCode;
  readonly message: string;
}

/* ────────────────────────────────────────────────────────────
   Entrada y salida públicas
   ──────────────────────────────────────────────────────────── */

export type Tier = 'Excelente' | 'Bueno' | 'Moderado' | 'Malo' | 'Sin datos suficientes';

/** Lo mínimo que el motor necesita de un producto (lo cumplen `RawProduct` y los scripts). */
export interface ProductInput {
  readonly product_name?: string;
  readonly ingredients_text?: string;
  readonly nutriments?: Record<string, unknown>;
  readonly additives_tags?: readonly string[];
  readonly labels_tags?: readonly string[];
  readonly categories?: string;
  readonly image_url?: string;
  readonly image_front_url?: string;
}

/** Un ingrediente tal como lo consume la UI (§7). */
export interface AnalyzedIngredient {
  readonly name: string;
  /** Posición en la etiqueta (1-indexed): el usuario tiene que poder seguir
   *  la lista con el dedo. */
  readonly position: number;
  readonly impact: Impact;
  /** Cuánto restó ESTE ingrediente. Negativo o 0. */
  readonly delta: number;
  readonly sev: Severity;
  readonly desc: string;
  readonly flag: boolean;
  /** ⚑ marcador de ultraprocesado (§2 Paso 3). */
  readonly marker: boolean;
  readonly percent?: number;
  readonly detail?: string;
}

/** Octógonos de la Ley 27.642 — dato oficial, verificable contra el envase. */
export type WarningSeal =
  | 'EXCESO EN AZÚCARES'
  | 'EXCESO EN GRASAS SATURADAS'
  | 'EXCESO EN GRASAS TOTALES'
  | 'EXCESO EN SODIO'
  | 'EXCESO EN CALORÍAS';

export interface NutritionFacts {
  readonly calories: number | null;
  readonly protein: number | null;
  readonly carbs: number | null;
  readonly sugars: number | null;
  readonly fats: number | null;
  readonly satFats: number | null;
  readonly sodium: number | null;
  readonly fiber: number | null;
  readonly transFat: number | null;
  readonly cholesterol: number | null;
}

/** §2 Paso 3 — Qué tan formulado es el producto. */
export interface ProcessingVerdict {
  readonly markers: readonly string[];
  readonly modifier: number;
  /** Una frase para el usuario. Vacía cuando no hay nada que decir (§7). */
  readonly text: string;
}

export interface Disclaimer {
  readonly framing: string;
  readonly footer: string;
}

/** La salida completa del motor (§7). */
export interface ScoreBreakdown {
  readonly engineVersion: string;

  /** `null` cuando §1 dice que no se puntúa. Nunca un número estimado. */
  readonly score: number | null;
  readonly scoreAvailable: boolean;
  readonly noScore: NoScore | null;

  readonly tier: Tier;
  readonly tierColor: string;
  readonly tierMessage: string;

  /** La cuenta, paso por paso. No es telemetría: es la salida principal. */
  readonly steps: readonly ScoreStep[];

  /** Todos los ingredientes, en el orden de la etiqueta. */
  readonly ingredients: readonly AnalyzedIngredient[];

  readonly processing: ProcessingVerdict;

  /** "Desde la mirada Fitogenix": una frase, específica a este producto. */
  readonly fitogenixView: string;

  readonly annulments: readonly string[];
  readonly ceiling: Ceiling | null;

  readonly warnings: readonly WarningSeal[];
  /** §6.1 — se muestran aparte de los ingredientes. */
  readonly allergenWarnings: readonly string[];
  /** Avisos obligatorios: suplemento deportivo, curado vegetal, "y/o". */
  readonly notices: readonly string[];
  /** §9 — cola de curaduría: cada NO IDENTIFICADO, con su texto exacto. */
  readonly unidentified: readonly string[];

  readonly coverage: number;
  readonly confidence: 'alta' | 'media' | 'baja';

  readonly disclaimer: Disclaimer;
}
