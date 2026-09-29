/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Motor de puntuación v2.1
   (fitogenix_scoring_engine_v2_1.md)

   API pública del módulo `scoring` (docs/02-arquitectura.md §8.1, ADR-0003).
   Todo lo que está afuera de `src/modules/scoring/` importa de acá y de
   ningún archivo interno (regla `modulo-solo-por-index`).

   ── Cómo está armado (`domain/`) ──

     types.ts      el contrato: todas las formas del dominio, sin lógica
     constants.ts  los números de §2, juntos y auditables contra el documento
     text.ts       utilidades de string puras (normalizar, matchear frases)
     rubric/       el documento traducido a datos, una sección por archivo
     data/         la tabla de §4 crecida (ingredients.ts)
     catalog.ts    la única puerta a esa tabla
     matching.ts   consultas puras sobre la rúbrica
     cleaning.ts   §6 — limpiar la etiqueta antes de contar
     classify.ts   un ingrediente limpio → su clasificación (cadena de reglas)
     gates.ts      §1 y §5 — cuándo no se puntúa y cuándo anula
     ledger.ts     el acumulador que hace imposible mover el puntaje sin
                   registrar el paso
     steps.ts      §2 pasos 2-4, cada uno una función pura
     seals.ts      octógonos de la Ley 27.642 — dato oficial, paralelo
     explain.ts    §7 — el armado de la salida legible
     pipeline.ts   §2 — la orquestación, en el orden del documento
     presentation.ts  puntaje → label, color, tagline, sello y estado

   ── Las dos reglas que gobiernan todo lo demás ──

   1. TODO PUNTAJE TIENE QUE SER RECONSTRUIBLE. Por eso `breakdown.steps` no
      es telemetría opcional: es la salida principal. `ScoreLedger` hace que
      no exista un camino para mover el número sin dejar la fila.

   2. NO INVENTAR. Un ingrediente que no está en la tabla es NO IDENTIFICADO,
      con su costo (−8) y su techo. No se estima por analogía, no se deduce
      del nombre, no se le da el beneficio de la duda.

   Dominio puro: sin I/O, sin config, sin paquetes npm ni builtins de Node, y
   sin importar otros módulos ni `platform` (regla `scoring-es-puro`). Corre
   idéntico en el servidor, en el ETL y en los scripts de curaduría: la
   curaduría usa exactamente el mismo scoring que un escaneo en vivo.
═══════════════════════════════════════════════════════════ */

/**
 * `scoreProduct`: un producto → su puntaje y el desglose que lo explica.
 * `score` es `null` cuando §1 dice que no se puntúa. Nunca un número
 * estimado: "la ausencia de datos nunca mejora un puntaje".
 *
 * `analyzeIngredients`: los ingredientes analizados, en el orden de la
 * etiqueta (§7). Sale del mismo cálculo que el puntaje, así que la lista
 * siempre le corresponde al número que se está mostrando.
 */
export { analyzeIngredients, scoreProduct } from './domain/pipeline';

export { ENGINE_VERSION } from './domain/constants';

/** Las bandas del puntaje como dato del contrato (`contract/scoring-bands.json`,
 *  K-08, D-63). */
export {
  scoringBands,
  type NoDataBand,
  type ScoringBand,
  type ScoringBands,
} from './domain/bands';

export {
  getScoreLabel,
  getScoreTagline,
  getSello,
  resolveProductStatus,
  type ProductStatus,
  type ProductStatusTone,
  type ScoreLabel,
} from './domain/presentation';

/**
 * La tabla de ingredientes y aditivos (§4, `domain/data/ingredients.ts`), para
 * las herramientas de curaduría de `scripts/`: `add-en-aliases.ts` la lee, le
 * suma aliases en memoria y reescribe el archivo (en su propio proceso, nunca
 * en el server). El motor la consulta por `domain/catalog.ts`; nadie de
 * afuera la usa para puntuar.
 */
export {
  ADDITIVES,
  INGREDIENTS,
  type Additive,
  type Ingredient,
} from './domain/data/ingredients';

export type {
  AnalyzedIngredient,
  Ceiling,
  Impact,
  NoScore,
  NoScoreCode,
  NutritionFacts,
  ProcessingVerdict,
  ProductInput,
  ScoreBreakdown,
  ScoreStep,
  ScoreStepKind,
  Severity,
  Tier,
  WarningSeal,
} from './domain/types';
