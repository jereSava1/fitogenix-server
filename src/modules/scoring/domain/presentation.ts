// Presentación derivada del puntaje, toda desde `TIERS`. `null` es su propia banda: nunca se
// lee como cero. Lo que ve la app sale de `presentScore`.

import { BAD_BELOW, EXCELLENT_FROM, GOOD_FROM, NO_DATA_TIER } from './constants';
import { tierFor } from './explain';

export interface ScoreLabel {
  readonly label: string;
  readonly color: string;
}

export function getScoreLabel(score: number | null): ScoreLabel {
  if (score == null) return { label: NO_DATA_TIER.tier.toUpperCase(), color: NO_DATA_TIER.color };
  const tier = tierFor(score);
  return { label: tier.tier.toUpperCase(), color: tier.color };
}

export function getScoreTagline(score: number | null): string {
  return score == null ? NO_DATA_TIER.message : tierFor(score).message;
}

/** Excelente lleva el sello Fitogénico, Malo el contrario; el medio y sin puntaje, ninguno. */
export function getSello(score: number | null): string | null {
  if (score == null) return null;
  if (score >= EXCELLENT_FROM) return 'FITOGÉNICO';
  if (score < BAD_BELOW) return 'NO FITOGÉNICO';
  return null;
}

export type ProductStatusTone = 'positive' | 'negative' | 'neutral';

export interface ProductStatus {
  readonly label: 'Fitogénico' | 'No fitogénico' | 'Consumo consciente' | 'Sin datos suficientes';
  readonly tone: ProductStatusTone;
}

/** El estado del producto, con los mismos cortes: coincide con `getSello`. */
export function resolveProductStatus(score: number | null): ProductStatus {
  if (score == null) return { label: 'Sin datos suficientes', tone: 'neutral' };
  if (score >= EXCELLENT_FROM) return { label: 'Fitogénico', tone: 'positive' };
  if (score < BAD_BELOW) return { label: 'No fitogénico', tone: 'negative' };
  return { label: 'Consumo consciente', tone: 'neutral' };
}

/** Sello del producto en la app: el mismo criterio que `getSello`. */
export type Fito = 'fito' | 'nofito' | 'none';

/** `fito` sale del tono del estado: así el sello de la app, el estado y
 *  `getSello` no pueden decir cosas distintas. */
const FITO_BY_TONE: Record<ProductStatusTone, Fito> = {
  positive: 'fito',
  negative: 'nofito',
  neutral: 'none',
};

/** Qué grupo destaca la app: cuestionables debajo de la banda Buena, beneficiosos desde ahí,
 *  ninguno sin puntaje (D-71). */
export type Highlight = 'cuestionables' | 'beneficiosos' | 'ninguno';

export interface ScorePresentation {
  readonly label: string;
  readonly color: string;
  readonly fito: Fito;
  readonly highlight: Highlight;
}

/** La presentación que recibe la app (ADR-0003): nadie más recalcula cortes. */
export function presentScore(score: number | null): ScorePresentation {
  const { label, color } = getScoreLabel(score);
  const fito = FITO_BY_TONE[resolveProductStatus(score).tone];
  if (score == null) return { label, color, fito, highlight: 'ninguno' };
  const highlight: Highlight = score < GOOD_FROM ? 'cuestionables' : 'beneficiosos';
  return { label, color, fito, highlight };
}
