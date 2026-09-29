// API pública del motor de puntuación (v2.1). Dominio puro (regla `scoring-es-puro`): corre
// igual en el server, el ETL y los scripts. Todo puntaje es reconstruible (`breakdown.steps`)
// y lo que no está en la tabla es NO IDENTIFICADO: no se estima por analogía.

/** `scoreProduct`: puntaje y desglose (`score` null si §1 dice que no se puntúa).
 *  `analyzeIngredients`: los ingredientes en orden, del mismo cálculo. */
export { analyzeIngredients, scoreProduct } from './domain/pipeline';

export { ENGINE_VERSION } from './domain/constants';

/** Las bandas como dato del contrato (`contract/scoring-bands.json`). */
export {
  scoringBands,
  type NoDataBand,
  type ScoringBand,
  type ScoringBands,
} from './domain/bands';

/** Presentación para la app. `getScoreLabel` y `getSello`, para las columnas del ETL. */
export {
  getScoreLabel,
  getSello,
  presentScore,
  type Fito,
  type Highlight,
  type ScorePresentation,
} from './domain/presentation';

/** La tabla de ingredientes, para los scripts de curaduría (el motor la consulta por
 *  domain/catalog.ts). */
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
