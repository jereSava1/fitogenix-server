// Scoring algorithm ported from the Fitogenix web app — exact thresholds
// from fitogenix.html's scoreColor/scoreLabel/scoreTagline/fitoStatus.

export type ScoreLabel = {
  label: string;
  color: string;
};

// Umbrales de fitogenix_scoring_engine_v1.md §1:
// 75-100 Excelente · 50-74 Bueno · 25-49 Moderado · 0-24 Malo.
// Fuente única: TIERS en scoringRubric.ts — acá solo se adapta el formato que
// espera la UI (label en mayúsculas). Antes estaban duplicados a mano con los
// umbrales viejos (85/70/50), que es como se desincronizaron.
import { TIERS } from './scoringRubric';

function tierOf(score: number) {
  return TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1];
}

export function getScoreLabel(score: number): ScoreLabel {
  const t = tierOf(score);
  return { label: t.tier.toUpperCase(), color: t.color };
}

export function getScoreTagline(score: number): string {
  return tierOf(score).message;
}

// El sello sigue las bandas de §1: Excelente lleva sello Fitogénico, Malo
// lleva el contrario, y las dos bandas del medio (Bueno/Moderado) van sin
// sello. Antes era 70+/<50, umbrales del sistema viejo.
export function getSello(score: number): string | null {
  if (score >= 75) return 'FITOGÉNICO';
  if (score < 25) return 'NO FITOGÉNICO';
  return null;
}
