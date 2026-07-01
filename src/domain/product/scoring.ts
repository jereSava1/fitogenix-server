// Scoring algorithm ported from the Fitogenix web app — exact thresholds
// from fitogenix.html's scoreColor/scoreLabel/scoreTagline/fitoStatus.

export type ScoreLabel = {
  label: string;
  color: string;
};

export function getScoreLabel(score: number): ScoreLabel {
  if (score >= 75) return { label: 'EXCELENTE', color: '#16a34a' };
  if (score >= 50) return { label: 'BUENO', color: '#84cc16' };
  if (score >= 25) return { label: 'MODERADO', color: '#f97316' };
  return { label: 'MALO', color: '#dc2626' };
}

export function getScoreTagline(score: number): string {
  if (score >= 75) return 'Lo recomendamos';
  if (score >= 50) return 'Buena opción';
  if (score >= 25) return 'Consumilo con consciencia';
  return 'No lo recomendamos';
}

export function getSello(score: number): string | null {
  if (score >= 65) return 'FITOGÉNICO';
  if (score < 30) return 'NO FITOGÉNICO';
  return null;
}
