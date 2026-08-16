/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Motor de puntuación v2.1
   (fitogenix_scoring_engine_v2_1.md)

   API pública del motor. Todo lo que está afuera de esta carpeta importa de
   acá y de ningún otro archivo interno.

   ── Cómo está armado ──

     types.ts      el contrato: todas las formas del dominio, sin lógica
     constants.ts  los números de §2, juntos y auditables contra el documento
     text.ts       utilidades de string puras (normalizar, matchear frases)
     rubric/       el documento traducido a datos, una sección por archivo
     catalog.ts    la tabla de §4 crecida (ingredientData), tras una sola puerta
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

   Lógica pura, cero imports de React Native / Expo: corre idéntico en el
   servidor y en los scripts de curaduría. Que sea agnóstico del framework es
   lo que permite que la curaduría use exactamente el mismo scoring que un
   escaneo en vivo.
═══════════════════════════════════════════════════════════ */

export { analyzeIngredients, scoreProduct } from './pipeline';

export {
  BASE_SCORE,
  CEILINGS,
  DEDUCTIONS,
  DISCLAIMER,
  DOMINANCE,
  ENGINE_VERSION,
  HEAD_POSITIONS,
  NO_DATA_TIER,
  PROCESSING,
  TIERS,
  EXCELLENT_FROM,
  BAD_BELOW,
} from './constants';

export { indexOfPhrase, matchesPhrase, normalizeText } from './text';
export { anchorScore, matchAnchor, resolveLabelAbbreviation, rubricImpact, rubricMatches } from './matching';
export { cleanIngredientList } from './cleaning';
export { classifyIngredient, resolvesToSomething, severityOf } from './classify';
export { computeWarningSeals, sealPenalty, type SealInput } from './seals';
export { tierFor } from './explain';
export {
  getScoreLabel,
  getScoreTagline,
  getSello,
  resolveProductStatus,
  type ProductStatus,
  type ProductStatusTone,
  type ScoreLabel,
} from './presentation';
export { ScoreLedger } from './ledger';

export type {
  AnalyzedIngredient,
  Anchor,
  AnchorMatch,
  AnnulGate,
  Ceiling,
  CleanedList,
  CleanIngredient,
  Disclaimer,
  EvaluatedIngredient,
  Impact,
  ImpactEntry,
  ImpactMatch,
  IngredientResolver,
  NoScore,
  NoScoreCode,
  NutritionFacts,
  ProcessingVerdict,
  ProductInput,
  RubricMatch,
  ScoreBreakdown,
  ScoreStep,
  ScoreStepKind,
  Severity,
  Tier,
  TierDefinition,
  WarningSeal,
} from './types';
