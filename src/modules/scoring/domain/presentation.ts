/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Presentación derivada del puntaje

   Label, color, tagline, sello, estado y qué ingredientes destacar. Todo
   sale de `TIERS`, que es la ÚNICA fuente de los umbrales en el sistema.
   Lo que ve la app sale de `presentScore` (ADR-0003, K-04).

   Antes no era así, y el síntoma se veía en el payload: había tres criterios
   distintos para la misma decisión —75/50/25 en las bandas, 70/50 en el
   estado del producto, 75/25 en el sello— así que un producto de 72 salía
   "Bueno / Buena opción" y al mismo tiempo con sello "Fitogénico", y uno de
   35 salía "no fitogénico" mientras la columna de sello quedaba vacía.
   Tres números para una sola pregunta es tres oportunidades de contradecirse.

   `null` es un valor legítimo: el motor no emite puntaje en los casos de §1.
   Se trata como su propia banda en vez de coercionarlo a cero, que se leería
   como "el peor producto posible".
═══════════════════════════════════════════════════════════ */

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

/**
 * El sello sigue las bandas: Excelente lleva el sello Fitogénico, Malo lleva
 * el contrario, y las dos bandas del medio van sin sello.
 *
 * Sin puntaje no hay sello: no sabemos lo suficiente como para poner ninguno
 * de los dos.
 */
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

/**
 * El estado del producto, con los MISMOS cortes que las bandas.
 *
 * Coincide con `getSello` por construcción: si el sello dice "Fitogénico", el
 * estado también, siempre.
 */
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

/**
 * Qué grupo de ingredientes destaca la pantalla de resultado. Reemplaza al
 * `flagged` (< 40) que se armaba en catalog y al `score < 50` de native: el
 * corte es el de la banda Buena (`GOOD_FROM`). Sin puntaje no se destaca
 * ninguno: si el producto no se pudo medir, no se puede decir que sus
 * ingredientes sean beneficiosos ni cuestionables (D-71).
 */
export type Highlight = 'cuestionables' | 'beneficiosos' | 'ninguno';

export interface ScorePresentation {
  readonly label: string;
  readonly color: string;
  readonly fito: Fito;
  readonly highlight: Highlight;
}

/**
 * La presentación del puntaje que recibe la app (ADR-0003): ÚNICA fuente, así
 * ni catalog ni native recalculan cortes. Sin `tagline` (D-38) ni `sello`
 * (equivale a `fito`; el sello escrito solo alimenta la columna que se borra
 * en B-01, D-35).
 */
export function presentScore(score: number | null): ScorePresentation {
  const { label, color } = getScoreLabel(score);
  const fito = FITO_BY_TONE[resolveProductStatus(score).tone];
  if (score == null) return { label, color, fito, highlight: 'ninguno' };
  const highlight: Highlight = score < GOOD_FROM ? 'cuestionables' : 'beneficiosos';
  return { label, color, fito, highlight };
}
