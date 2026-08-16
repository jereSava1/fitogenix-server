/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Contrato del motor de puntuación

   Todas las formas del dominio viven acá, en un solo archivo sin lógica ni
   dependencias. Los módulos del motor importan de acá; nadie importa tipos
   desde un módulo que además ejecuta algo.

   El criterio para que algo sea un tipo con nombre y no un objeto anónimo:
   si aparece en más de una firma, o si cruza el borde de un módulo, tiene
   nombre. Los objetos de un solo uso interno siguen siendo anónimos.
═══════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────
   Impacto y niveles (§2 Paso 2, §4)
   ──────────────────────────────────────────────────────────── */

/**
 * §2 Paso 2 — Los tres niveles de impacto del documento, más los dos estados
 * que NO son niveles:
 *
 * · `none`        — lo reconocimos y no tenemos objeción.
 * · `desconocido` — no sabemos qué es (§4.7). Tiene costo propio y techo.
 *
 * Que sean estados distintos es la corrección del defecto más grave que tuvo
 * el motor: cuando "no sé" y "está bien" colapsaban en el mismo valor, no
 * saber empujaba el puntaje hacia arriba.
 */
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

/**
 * §4 — Una fila de la tabla de ingredientes.
 *
 * "Esta sección es datos, no reglas. Crece sin agregar complejidad al
 * sistema." Agregar una fila acá no toca ninguna función del motor.
 */
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

/**
 * §3 — Una fila de la tabla de anclas.
 *
 * Un ancla es terminal: si la lista entera cabe en la fila, ese ES el puntaje
 * del producto y no se recorre el resto del pipeline.
 */
export interface Anchor {
  readonly id: string;
  readonly label: string;
  /** Extremos del rango que declara el documento. */
  readonly min: number;
  readonly max: number;
  /** Al menos uno de estos tiene que estar presente… */
  readonly required: readonly string[];
  /**
   * …o todos los términos de alguno de estos conjuntos. Existe porque varias
   * filas de §3 se describen por su composición y no por su nombre: un yogur
   * declara "leche, fermentos" y la palabra "yogur" no aparece nunca.
   */
  readonly requiredAll?: readonly (readonly string[])[];
  /** Además de lo anterior, solo estos pueden aparecer. */
  readonly allowed: readonly string[];
  /** La categoría delata el arquetipo aunque el listado no lo nombre. */
  readonly categoryPattern?: RegExp;
  /**
   * §2 Paso 1 dice "1 o 2 ingredientes", pero varias filas de §3 describen
   * productos de 3-5 componentes (queso, masa madre, pasta seca, conservas).
   * El tope es por fila, no global.
   */
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

/**
 * Una regla de clasificación. Devuelve `null` cuando no tiene opinión y el
 * turno pasa a la siguiente.
 *
 * Modelar el orden de precedencia de §4 como una cadena de resolutores —y no
 * como una escalera de `if`— permite testear cada regla por separado y hace
 * que el orden sea un dato visible en vez de una propiedad del control de
 * flujo.
 */
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

/**
 * Una fila de la cuenta. `delta` es `null` en los pasos que FIJAN un valor
 * (base, ancla, techo, anulación, clamp) en vez de sumarlo.
 */
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

/**
 * Lo mínimo que el motor necesita de un producto. La satisfacen
 * estructuralmente tanto `RawOFFProduct` como los objetos que arman los
 * scripts de curaduría.
 *
 * `nova_group` sigue en la entrada porque viene en el payload y se expone como
 * información, pero desde v2.1 NO participa del cálculo: el puntaje sale de la
 * lista de ingredientes.
 */
export interface ProductInput {
  readonly product_name?: string;
  readonly ingredients_text?: string;
  readonly nutriments?: Record<string, unknown>;
  readonly nova_group?: number;
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

  /**
   * `null` cuando §1 dice que no se puntúa. Nunca un número estimado: "la
   * ausencia de datos nunca mejora un puntaje".
   */
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
