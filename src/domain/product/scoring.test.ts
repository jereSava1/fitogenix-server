// Blindaje de los umbrales de tier — fitogenix_scoring_engine_v1.md §1:
// 75-100 Excelente · 50-74 Bueno · 25-49 Moderado · 0-24 Malo.
//
// Ojo al leer esto contra el historial: los umbrales anteriores eran
// 85/70/50 y la banda "Malo" arrancaba en <50. El spec v1.0 ensancha las
// bandas del medio y reserva "Malo" para 0-24, que en la práctica es casi
// siempre un producto con compuerta de anulación (§4).
import { describe, expect, it } from 'vitest';
import { getScoreLabel, getScoreTagline, getSello } from './scoring';

describe('scoring — umbrales de §1', () => {
  it('75+ es EXCELENTE', () => {
    expect(getScoreLabel(75).label).toBe('EXCELENTE');
    expect(getScoreLabel(100).label).toBe('EXCELENTE');
    expect(getScoreLabel(75).color).toBe('#16a34a');
  });

  it('50-74 es BUENO', () => {
    expect(getScoreLabel(50).label).toBe('BUENO');
    expect(getScoreLabel(74).label).toBe('BUENO');
    expect(getScoreLabel(50).color).toBe('#84cc16');
  });

  it('25-49 es MODERADO (naranja)', () => {
    expect(getScoreLabel(25).label).toBe('MODERADO');
    expect(getScoreLabel(49).label).toBe('MODERADO');
    expect(getScoreLabel(49).color).toBe('#f97316');
  });

  it('0-24 es MALO — la banda de las anulaciones de §4', () => {
    expect(getScoreLabel(24).label).toBe('MALO');
    expect(getScoreLabel(0).label).toBe('MALO');
    expect(getScoreLabel(0).color).toBe('#dc2626');
  });

  it('el mensaje al usuario acompaña la banda (§1)', () => {
    expect(getScoreTagline(80)).toBe('Lo recomendamos');
    expect(getScoreTagline(60)).toBe('Buena opción');
    expect(getScoreTagline(30)).toBe('Consúmelo con consciencia');
    expect(getScoreTagline(10)).toBe('No lo recomendamos');
  });

  it('sello: solo en los extremos, sin sello en Bueno/Moderado', () => {
    expect(getSello(75)).toBe('FITOGÉNICO');
    expect(getSello(60)).toBeNull();
    expect(getSello(30)).toBeNull();
    expect(getSello(24)).toBe('NO FITOGÉNICO');
  });
});
