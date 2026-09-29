// Todos los coeficientes del motor (§2), sin lógica: auditar contra el documento y calibrar
// es editar constantes.

import type { DeductionRates, Disclaimer, Impact, TierDefinition } from './types';

/** Versión del motor. Se guarda en `products.engine_version` (la columna se va en B-01). */
export const ENGINE_VERSION = 'ftg-rubric-v2.3';

/* ── §2 Paso 1 — Punto de partida ─────────────────────────────────────── */

/** Base de todo producto que no cae en un ancla de §3. */
export const BASE_SCORE = 75;

/* ── §2 Paso 2 — Los seis coeficientes ────────────────────────────────── */

/** Los ÚNICOS seis coeficientes: todo puntaje se reconstruye con esta tabla más el
 *  modificador de procesamiento (un test lo verifica producto por producto). */
export const DEDUCTIONS: Readonly<Record<Impact, DeductionRates>> = {
  alto:        { first3: 13, rest: 6 },
  medio:       { first3: 7,  rest: 3 },
  bajo:        { first3: 3,  rest: 1 },
  desconocido: { first3: 8,  rest: 8 },
  none:        { first3: 0,  rest: 0 },
};

/** Frontera entre "primeros 3 ingredientes" y "del 4º en adelante". Se cuenta
 *  sobre la lista YA limpia y aplanada (§6). */
export const HEAD_POSITIONS = 3;

/* ── §2 Paso 3 — Modificador de procesamiento ─────────────────────────── */

export const PROCESSING = {
  /** 4 o más marcadores de ultraprocesado. */
  manyMarkers: -15,
  /** 1 a 3 marcadores. */
  someMarkers: -10,
  /** Sin marcadores, con el puntaje ya en ≥ `bonusThreshold`. */
  cleanBonus: +5,
  bonusThreshold: 70,
  manyMarkersFrom: 4,
} as const;

/* ── §2 Paso 4 — Techos ───────────────────────────────────────────────── */

/** Si aplica más de uno, vale el más bajo. */
export const CEILINGS = {
  /** 1 ingrediente no identificado · suplemento deportivo · proteína
   *  mayormente aislada o concentrada. */
  soft: 74,
  /** Nitrito o nitrato añadido en producto NO cárnico. */
  nitriteNonMeat: 59,
  /** 2 ingredientes no identificados · cárnico curado CON ascorbato. */
  hard: 49,
} as const;

/** §3 — Regla de dominancia: un ingrediente declarado con más del 50% no deja
 *  que el producto supere su propia ancla + 10. */
export const DOMINANCE = { thresholdPct: 50, allowance: 10 } as const;

/* ── §5 — Anulaciones ─────────────────────────────────────────────────── */

/** `Puntaje = 20 − (6 × cantidad)`, piso 0, `−4` si va dirigido a niños. */
export const ANNULMENT = { base: 20, perGate: 6, childrenExtra: 4 } as const;

/* ── §1.2 — Cuándo la lista no describe nada ──────────────────────────── */

export const NO_DATA = {
  /** "3 o más ingredientes no identificados…" */
  unknownCountLimit: 3,
  /** "…o más del 30% de la lista." */
  unknownRatioLimit: 0.3,
  /** El criterio porcentual rige desde acá: con menos, un solo término opaco en una lista
   *  corta haría inalcanzables los techos de 1 y 2 no identificados (§2 Paso 4). */
  unknownRatioAppliesFrom: 2,
  /** Fracción mínima de caracteres alfabéticos para que un fragmento diga algo. */
  minAlphaRatio: 0.5,
} as const;

/* ── Modificador nutricional (fuera del documento) ────────────────────── */

/** Paso nutricional (decisión de producto, fuera de §2): octógonos de la Ley 27.642 y grasa
 *  trans declarada. Atrapa un panel desastroso con una lista correcta. Paso propio del
 *  desglose, para no romper la reconstruibilidad. */
export const NUTRITION = {
  /** Por encima de esto la grasa trans declarada penaliza. */
  transFatThreshold: 0.2,
  /** A partir de acá se considera severa. */
  transFatSevereFrom: 2,
  transFatPenalty: 8,
  transFatSeverePenalty: 15,
  /** Piso del paso: el panel baja el puntaje pero no por debajo de esto (0-14 es para las
   *  anulaciones y las anclas de fondo). Si ya venía por debajo, no lo mueve. */
  floor: 15,
} as const;

/* ── §2 — Categorías ──────────────────────────────────────────────────── */

/** Las bandas: única fuente de los umbrales (presentación, sello y estado salen de acá). */
export const TIERS: readonly TierDefinition[] = [
  { min: 75, tier: 'Excelente', color: '#16a34a', message: 'Lo recomendamos' },
  { min: 50, tier: 'Bueno',     color: '#84cc16', message: 'Buena opción' },
  { min: 25, tier: 'Moderado',  color: '#f97316', message: 'Consumilo con consciencia' },
  { min: 0,  tier: 'Malo',      color: '#dc2626', message: 'No lo recomendamos' },
];

/** La banda de los productos que no se puntúan (§1). */
export const NO_DATA_TIER = {
  tier: 'Sin datos suficientes',
  color: '#9ca3af',
  message: 'No tenemos datos confiables de este producto',
} as const;

/** Umbral de la banda alta: el sello Fitogénico y el estado "positivo". */
export const EXCELLENT_FROM = TIERS[0].min;
/** Desde acá se destacan los ingredientes beneficiosos; por debajo, los cuestionables. */
export const GOOD_FROM = TIERS[1].min;
/** Umbral de la banda baja: el sello contrario y el estado "negativo". */
export const BAD_BELOW = TIERS[2].min;

/* ── §7 — Encuadre fijo en pantalla ───────────────────────────────────── */

export const DISCLAIMER: Disclaimer = {
  framing:
    'Los puntajes de Fitogenix reflejan un criterio de alimentación integral y mínimamente procesada. Es una postura declarada, no una medición médica ni nutricional.',
  footer:
    'Fitogenix no es consejo médico ni nutricional, no contempla alergias ni condiciones de salud, y no reemplaza la consulta con un profesional.',
};

/** Umbrales de la lectura en palabras de la cobertura. */
export const CONFIDENCE = { high: 0.8, medium: 0.5 } as const;
