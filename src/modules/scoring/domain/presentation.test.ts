/* Blindaje de los umbrales de banda — §2 del documento:
 * 75-100 Excelente · 50-74 Bueno · 25-49 Moderado · 0-24 Malo · sin puntaje.
 *
 * Ojo al leer esto contra el historial: los umbrales originales eran 85/70/50
 * y la banda "Malo" arrancaba en <50. El documento ensancha las bandas del
 * medio y reserva "Malo" para 0-24, que en la práctica es casi siempre un
 * producto con una anulación de §5.
 */
import { describe, expect, it } from 'vitest';
import { getScoreLabel, getScoreTagline, getSello, presentScore, resolveProductStatus } from './presentation';

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

/* T-02 · Caracterización de los bordes de banda (docs/05-plan.md).
 *
 * Fija la presentación completa en cada borde, tal como está hoy. Si un
 * cambio mueve un corte, este bloque falla en el borde exacto.
 */
describe('caracterización — bordes de banda (T-02)', () => {
  const BORDES: ReadonlyArray<[
    number | null,
    { label: string; color: string; tagline: string; sello: string | null; estado: string },
  ]> = [
    [0, { label: 'MALO', color: '#dc2626', tagline: 'No lo recomendamos', sello: 'NO FITOGÉNICO', estado: 'No fitogénico' }],
    [24, { label: 'MALO', color: '#dc2626', tagline: 'No lo recomendamos', sello: 'NO FITOGÉNICO', estado: 'No fitogénico' }],
    [25, { label: 'MODERADO', color: '#f97316', tagline: 'Consumilo con consciencia', sello: null, estado: 'Consumo consciente' }],
    [39, { label: 'MODERADO', color: '#f97316', tagline: 'Consumilo con consciencia', sello: null, estado: 'Consumo consciente' }],
    [40, { label: 'MODERADO', color: '#f97316', tagline: 'Consumilo con consciencia', sello: null, estado: 'Consumo consciente' }],
    [49, { label: 'MODERADO', color: '#f97316', tagline: 'Consumilo con consciencia', sello: null, estado: 'Consumo consciente' }],
    [50, { label: 'BUENO', color: '#84cc16', tagline: 'Buena opción', sello: null, estado: 'Consumo consciente' }],
    [74, { label: 'BUENO', color: '#84cc16', tagline: 'Buena opción', sello: null, estado: 'Consumo consciente' }],
    [75, { label: 'EXCELENTE', color: '#16a34a', tagline: 'Lo recomendamos', sello: 'FITOGÉNICO', estado: 'Fitogénico' }],
    [100, { label: 'EXCELENTE', color: '#16a34a', tagline: 'Lo recomendamos', sello: 'FITOGÉNICO', estado: 'Fitogénico' }],
    [null, { label: 'SIN DATOS SUFICIENTES', color: '#9ca3af', tagline: 'No tenemos datos confiables de este producto', sello: null, estado: 'Sin datos suficientes' }],
  ];

  it.each(BORDES)('puntaje %s', (score, esperado) => {
    expect(getScoreLabel(score)).toEqual({ label: esperado.label, color: esperado.color });
    expect(getScoreTagline(score)).toBe(esperado.tagline);
    expect(getSello(score)).toBe(esperado.sello);
    expect(resolveProductStatus(score).label).toBe(esperado.estado);
  });
});

/* K-04 · `presentScore`: lo que recibe la app (ADR-0003). Cada borde de banda
 * que exige el ADR (0, 24, 25, 49, 50, 74, 75, 100 y `null`), más el 39/40 del
 * `flagged` que reemplaza `highlight`. */
describe('presentScore — bordes de banda (K-04)', () => {
  const BORDES: ReadonlyArray<[number | null, ReturnType<typeof presentScore>]> = [
    [0, { label: 'MALO', color: '#dc2626', fito: 'nofito', highlight: 'cuestionables' }],
    [24, { label: 'MALO', color: '#dc2626', fito: 'nofito', highlight: 'cuestionables' }],
    [25, { label: 'MODERADO', color: '#f97316', fito: 'none', highlight: 'cuestionables' }],
    [39, { label: 'MODERADO', color: '#f97316', fito: 'none', highlight: 'cuestionables' }],
    [40, { label: 'MODERADO', color: '#f97316', fito: 'none', highlight: 'cuestionables' }],
    [49, { label: 'MODERADO', color: '#f97316', fito: 'none', highlight: 'cuestionables' }],
    [50, { label: 'BUENO', color: '#84cc16', fito: 'none', highlight: 'beneficiosos' }],
    [74, { label: 'BUENO', color: '#84cc16', fito: 'none', highlight: 'beneficiosos' }],
    [75, { label: 'EXCELENTE', color: '#16a34a', fito: 'fito', highlight: 'beneficiosos' }],
    [100, { label: 'EXCELENTE', color: '#16a34a', fito: 'fito', highlight: 'beneficiosos' }],
    [null, { label: 'SIN DATOS SUFICIENTES', color: '#9ca3af', fito: 'none', highlight: 'ninguno' }],
  ];

  it.each(BORDES)('puntaje %s', (score, esperado) => {
    expect(presentScore(score)).toEqual(esperado);
  });

  it('fito coincide con el sello y el estado en toda la escala', () => {
    for (let score = 0; score <= 100; score++) {
      const { fito } = presentScore(score);
      const sello = getSello(score);
      expect(fito, `score ${score}`).toBe(
        sello === 'FITOGÉNICO' ? 'fito' : sello === 'NO FITOGÉNICO' ? 'nofito' : 'none',
      );
      expect(resolveProductStatus(score).label === 'Fitogénico', `score ${score}`).toBe(fito === 'fito');
    }
  });
});
