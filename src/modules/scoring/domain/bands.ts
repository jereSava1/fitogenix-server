/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Las bandas del puntaje, como dato del contrato

   Lo que native necesita para mostrar las bandas (la guía, el explicador, los
   colores) sin transcribir ningún corte a mano (D-62, D-63). Se arma SOLO
   desde `TIERS` y `NO_DATA_TIER`, y el label, el mensaje y el sello de cada
   banda se piden a las mismas funciones que presentan un producto
   (`getScoreLabel`, `getScoreTagline`, `getSello`): si una banda y un
   producto de esa banda dijeran cosas distintas, lo detecta `bands.test.ts`.

   El server lo publica en `contract/scoring-bands.json` junto con el OpenAPI
   (`npm run contract:generate`, K-08); el CI falla si el archivo commiteado
   no coincide con el motor.
═══════════════════════════════════════════════════════════ */

import { NO_DATA_TIER, TIERS } from './constants';
import { MAX_SCORE, MIN_SCORE } from './ledger';
import { getScoreLabel, getScoreTagline, getSello } from './presentation';

export interface ScoringBand {
  /** Nombre de la banda (`Tier`): 'Excelente', 'Bueno', 'Moderado', 'Malo'. */
  readonly name: string;
  /** Lo que llega en `scoreLabel` de un producto de esta banda. */
  readonly label: string;
  /** Puntaje mínimo y máximo, inclusive (el puntaje es un entero). */
  readonly from: number;
  readonly to: number;
  readonly color: string;
  /** El mensaje de la banda (hasta K-04 llegaba en el `tagline` de cada
   *  producto; ahora solo viaja acá, D-38). */
  readonly message: string;
  /** El sello de la banda, o `null` en las del medio. */
  readonly sello: string | null;
}

export interface NoDataBand {
  readonly name: string;
  readonly label: string;
  readonly color: string;
  readonly message: string;
  readonly sello: null;
}

export interface ScoringBands {
  readonly scale: { readonly min: number; readonly max: number };
  /** De la más alta a la más baja, sin huecos ni solapes. */
  readonly bands: readonly ScoringBand[];
  /** La banda de los productos que no se puntúan (`score: null`, §1). */
  readonly noData: NoDataBand;
}

export function scoringBands(): ScoringBands {
  const bands = TIERS.map((tier, i): ScoringBand => {
    const to = i === 0 ? MAX_SCORE : TIERS[i - 1].min - 1;
    return {
      name: tier.tier,
      label: getScoreLabel(tier.min).label,
      from: tier.min,
      to,
      color: getScoreLabel(tier.min).color,
      message: getScoreTagline(tier.min),
      sello: getSello(tier.min),
    };
  });

  return {
    scale: { min: MIN_SCORE, max: MAX_SCORE },
    bands,
    noData: {
      name: NO_DATA_TIER.tier,
      label: getScoreLabel(null).label,
      color: getScoreLabel(null).color,
      message: getScoreTagline(null),
      sello: null,
    },
  };
}
