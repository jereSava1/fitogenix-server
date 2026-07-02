// Scoring algorithm ported from the Fitogenix web app — exact thresholds
// from fitogenix.html's scoreColor/scoreLabel/scoreTagline/fitoStatus.

export type ScoreLabel = {
  label: string;
  color: string;
};

// Umbrales alineados con la spec Fitogenix:
// 85+ Excelente · 70-84 Bueno · 50-69 Moderado · <50 Malo.
export function getScoreLabel(score: number): ScoreLabel {
  if (score >= 85) return { label: 'EXCELENTE', color: '#16a34a' };
  if (score >= 70) return { label: 'BUENO', color: '#84cc16' };
  if (score >= 50) return { label: 'MODERADO', color: '#f97316' };
  return { label: 'MALO', color: '#dc2626' };
}

export function getScoreTagline(score: number): string {
  if (score >= 85) return 'Lo recomendamos';
  if (score >= 70) return 'Buena opción';
  if (score >= 50) return 'Consumilo con consciencia';
  return 'No lo recomendamos';
}

// Fitogénico 70+ · No fitogénico <50 · sin sello en la zona Moderado (50-69).
export function getSello(score: number): string | null {
  if (score >= 70) return 'FITOGÉNICO';
  if (score < 50) return 'NO FITOGÉNICO';
  return null;
}
