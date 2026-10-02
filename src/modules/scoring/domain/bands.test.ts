// Las bandas del contrato salen del motor y coinciden con cómo se presenta cada puntaje.
import { describe, expect, it } from 'vitest';
import { scoringBands } from './bands';
import { NO_DATA_TIER, TIERS } from './constants';
import { getScoreLabel, getScoreTagline, getSello } from './presentation';

const { scale, bands, noData } = scoringBands();

describe('scoringBands (K-08)', () => {
  it('una banda por cada TIER, en el mismo orden, con su corte, color y mensaje', () => {
    expect(bands.map((b) => [b.name, b.from, b.color, b.message])).toEqual(
      TIERS.map((t) => [t.tier, t.min, t.color, t.message]),
    );
  });

  it('cubren toda la escala, sin huecos ni solapes', () => {
    expect(bands[0].to).toBe(scale.max);
    expect(bands[bands.length - 1].from).toBe(scale.min);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].to).toBe(bands[i - 1].from - 1);
    }
  });

  it('cada puntaje de cada banda se presenta con el label, color, mensaje y sello de la banda', () => {
    for (const band of bands) {
      for (let score = band.from; score <= band.to; score++) {
        expect(getScoreLabel(score), `score ${score}`).toEqual({ label: band.label, color: band.color });
        expect(getScoreTagline(score), `score ${score}`).toBe(band.message);
        expect(getSello(score), `score ${score}`).toBe(band.sello);
      }
    }
  });

  it('solo la banda más alta lleva el sello positivo y solo la más baja el negativo', () => {
    expect(bands.map((b) => b.sello)).toEqual(['FITOGÉNICO', null, null, 'NO FITOGÉNICO']);
  });

  it('la banda "sin datos" es la de un producto sin puntaje', () => {
    expect(noData).toEqual({
      name: NO_DATA_TIER.tier,
      label: getScoreLabel(null).label,
      color: getScoreLabel(null).color,
      message: getScoreTagline(null),
      sello: getSello(null),
    });
  });
});
