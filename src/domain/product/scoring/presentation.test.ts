/* Blindaje de los umbrales de banda — §2 del documento:
 * 75-100 Excelente · 50-74 Bueno · 25-49 Moderado · 0-24 Malo · sin puntaje.
 *
 * Ojo al leer esto contra el historial: los umbrales originales eran 85/70/50
 * y la banda "Malo" arrancaba en <50. El documento ensancha las bandas del
 * medio y reserva "Malo" para 0-24, que en la práctica es casi siempre un
 * producto con una anulación de §5.
 */
import { describe, expect, it } from 'vitest';
import { getScoreLabel, getScoreTagline, getSello, resolveProductStatus } from './presentation';

describe('umbrales de banda', () => {
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
    expect(getScoreTagline(30)).toBe('Consumilo con consciencia');
    expect(getScoreTagline(10)).toBe('No lo recomendamos');
  });

  it('sello: solo en los extremos, sin sello en Bueno/Moderado', () => {
    expect(getSello(75)).toBe('FITOGÉNICO');
    expect(getSello(60)).toBeNull();
    expect(getSello(30)).toBeNull();
    expect(getSello(24)).toBe('NO FITOGÉNICO');
  });
});

describe('scoring — sin puntaje (§1)', () => {
  it('null tiene su propia banda, no se lee como cero', () => {
    expect(getScoreLabel(null).label).toBe('SIN DATOS SUFICIENTES');
    expect(getScoreLabel(null).color).not.toBe(getScoreLabel(0).color);
    expect(getScoreTagline(null)).toBe('No tenemos datos confiables de este producto');
    expect(getSello(null)).toBeNull();
  });
});

/* La coherencia entre las tres presentaciones del mismo puntaje.
 *
 * Este bloque existe por un bug concreto: había tres criterios distintos para
 * la misma decisión —75/50/25 en las bandas, 70/50 en el estado del producto,
 * 75/25 en el sello— así que un producto de 72 salía "BUENO / Buena opción" y
 * al mismo tiempo con estado "Fitogénico". Ahora los tres salen de TIERS, y
 * esto lo mantiene así.
 */
describe('coherencia de umbrales', () => {
  const TODOS = Array.from({ length: 101 }, (_, score) => score);

  it('el sello y el estado nunca se contradicen', () => {
    for (const score of TODOS) {
      const sello = getSello(score);
      const estado = resolveProductStatus(score);

      if (sello === 'FITOGÉNICO') expect(estado.label, `score ${score}`).toBe('Fitogénico');
      if (sello === 'NO FITOGÉNICO') expect(estado.label, `score ${score}`).toBe('No fitogénico');
      if (sello === null) expect(estado.label, `score ${score}`).toBe('Consumo consciente');
    }
  });

  it('el sello positivo cae exactamente sobre la banda Excelente', () => {
    for (const score of TODOS) {
      const esExcelente = getScoreLabel(score).label === 'EXCELENTE';
      expect(getSello(score) === 'FITOGÉNICO', `score ${score}`).toBe(esExcelente);
    }
  });

  it('el sello negativo cae exactamente sobre la banda Malo', () => {
    for (const score of TODOS) {
      const esMalo = getScoreLabel(score).label === 'MALO';
      expect(getSello(score) === 'NO FITOGÉNICO', `score ${score}`).toBe(esMalo);
    }
  });

  it('sin puntaje no hay sello, ni estado positivo ni negativo', () => {
    expect(getSello(null)).toBeNull();
    expect(resolveProductStatus(null)).toEqual({ label: 'Sin datos suficientes', tone: 'neutral' });
  });
});
