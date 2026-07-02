// Blindaje de los umbrales de tier tras alinearlos con la spec de negocio.
// Antes: 50+ era "Bueno" (verde) — una gaseosa a 52 aparecía como buena.
// Ahora: 50-69 es "Moderado" (naranja), 70+ Bueno, 85+ Excelente.
import { describe, expect, it } from 'vitest';
import { getScoreLabel, getSello } from './scoring';

describe('scoring — umbrales alineados con la spec Fitogenix', () => {
  it('50-69 es MODERADO (naranja), no BUENO', () => {
    // El caso concreto: Coca-Cola ~52, Nutella ~54.
    expect(getScoreLabel(52).label).toBe('MODERADO');
    expect(getScoreLabel(52).color).toBe('#f97316'); // naranja, no verde
    expect(getScoreLabel(54).label).toBe('MODERADO');
    expect(getScoreLabel(69).label).toBe('MODERADO');
  });

  it('70-84 es BUENO', () => {
    expect(getScoreLabel(70).label).toBe('BUENO');
    expect(getScoreLabel(84).label).toBe('BUENO');
  });

  it('85+ es EXCELENTE', () => {
    expect(getScoreLabel(85).label).toBe('EXCELENTE');
    expect(getScoreLabel(100).label).toBe('EXCELENTE');
  });

  it('<50 es MALO', () => {
    expect(getScoreLabel(49).label).toBe('MALO');
    expect(getScoreLabel(0).label).toBe('MALO');
  });

  it('sello: Fitogénico 70+, No fitogénico <50, sin sello en 50-69', () => {
    expect(getSello(70)).toBe('FITOGÉNICO');
    expect(getSello(52)).toBeNull();          // Moderado no lleva sello
    expect(getSello(49)).toBe('NO FITOGÉNICO');
  });
});
