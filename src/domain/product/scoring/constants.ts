/* ═══════════════════════════════════════════════════════════
   FITOGENIX — §2: los números del documento

   Todos los coeficientes del motor, juntos y sin lógica alrededor. Están acá
   para que se puedan auditar contra el documento de una sola lectura y para
   que calibrar sea editar constantes, no leer funciones.

   El documento se define a sí mismo por este archivo:
   6 coeficientes · 3 niveles de impacto · 1 mecanismo de techo · 6 anulaciones
═══════════════════════════════════════════════════════════ */

import type { DeductionRates, Disclaimer, Impact, TierDefinition } from './types';

/**
 * Versión del motor. Se persiste con cada fila cacheada y se compara al leer:
 * una entrada escrita por otra versión se trata como miss.
 *
 * v2.1 — el puntaje pasa a ser una función de la lista de ingredientes:
 * base 75 → restas por impacto y posición → modificador de procesamiento →
 * techos → clamp. Desaparecen el promedio ponderado de ejes, el modificador
 * NOVA y la regresión a neutro por cobertura. Los puntajes de v2 NO son
 * comparables con los de v2.1.
 *
 * v2.2 — se corrigen dos umbrales de octógonos contra la Tabla 1 del Decreto
 * 151/2022, verificados con la calculadora oficial de ANMAT: el sodio gana su
 * condición alternativa (≥300 mg/100 g) y el corte de calorías de bebidas baja
 * de 70 a 25 (ver `scoring/seals.ts`). Los dos erraban de menos, así que hay
 * productos que pasan a llevar un octógono más y por lo tanto bajan de puntaje
 * vía `sealPenalty`.
 *
 * El bump NO es cosmético: `redisService` trata como MISS toda entrada cuyo
 * sobre no coincida con esta constante, así que sin bumpear, Redis seguiría
 * sirviendo hasta 7 días los octógonos viejos.
 */
export const ENGINE_VERSION = 'ftg-rubric-v2.2';

/* ── §2 Paso 1 — Punto de partida ─────────────────────────────────────── */

/** Base de todo producto que no cae en un ancla de §3. */
export const BASE_SCORE = 75;

/* ── §2 Paso 2 — Los seis coeficientes ────────────────────────────────── */

/**
 * "Estos son los ÚNICOS valores válidos."
 *
 * Seis números. No hay un séptimo escondido en el motor: si un puntaje no se
 * puede reconstruir sumando entradas de esta tabla más el modificador de
 * procesamiento, el motor está mal — y hay un test que lo verifica producto
 * por producto.
 */
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
  /**
   * El criterio porcentual se aplica desde acá para arriba.
   *
   * Tomado al pie de la letra alcanzaría a cualquier lista de 3 ingredientes
   * con uno solo sin reconocer (1/3 = 33%), y eso volvería inalcanzables los
   * techos de 74 y 49 que §2 Paso 4 define justamente para 1 y 2 no
   * identificados. Un producto con un único término opaco tiene techo, no
   * ausencia de dato.
   */
  unknownRatioAppliesFrom: 2,
  /** Fracción mínima de caracteres alfabéticos para que un fragmento diga algo. */
  minAlphaRatio: 0.5,
} as const;

/* ── Modificador nutricional (fuera del documento) ────────────────────── */

/**
 * §2 de v2.1 NO tiene paso nutricional: el puntaje sale de la lista. Se
 * conserva el cruce con los octógonos de la Ley 27.642 y con la grasa trans
 * declarada por decisión de producto, porque atrapa lo que la lista sola no
 * ve —un producto de ingredientes correctos con un panel desastroso— y porque
 * el sello es un dato OFICIAL que el usuario puede verificar mirando el
 * envase.
 *
 * Va como paso propio del desglose, con su propio número, para no romper la
 * regla de reconstruibilidad.
 */
export const NUTRITION = {
  /** Por encima de esto la grasa trans declarada penaliza. */
  transFatThreshold: 0.2,
  /** A partir de acá se considera severa. */
  transFatSevereFrom: 2,
  transFatPenalty: 8,
  transFatSeverePenalty: 15,
  /**
   * Piso del paso. El panel puede bajar el puntaje, nunca subirlo, y no puede
   * llevarlo por debajo de esto: la banda 0-14 queda reservada para las
   * anulaciones de §5 y para las anclas de fondo (jarabe de maíz alto en
   * fructosa, bebida azucarada), que son juicios sobre la formulación y no
   * sobre la tabla nutricional.
   *
   * Si el puntaje YA venía por debajo del piso, el paso no lo mueve.
   */
  floor: 15,
} as const;

/* ── §2 — Categorías ──────────────────────────────────────────────────── */

/**
 * El puntaje determina la banda, nunca al revés.
 *
 * FUENTE ÚNICA de los umbrales en todo el sistema: la presentación
 * (`scoring.ts`), el sello y el estado del producto salen de acá. Antes había
 * tres criterios distintos para la misma decisión —75/50/25 acá, 70/50 en
 * `resolveProductStatus`, 75/25 en el sello— y un producto de 72 salía
 * "Bueno" con sello "Fitogénico".
 */
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
