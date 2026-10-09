import { describe, expect, it } from 'vitest';
import { classifyFidelity, diffCause, hasFourMacros, nutrientValues, sameBlock } from './fidelity';

const table = { 'energy-kcal_100g': 300, proteins_100g: 8, carbohydrates_100g: 50, fat_100g: 10, sodium_100g: 0.4 };

describe('nutrientValues y hasFourMacros', () => {
  it('lee los nutrientes numéricos y solo ellos', () => {
    expect([...nutrientValues({ ...table, 'nova-group': 4, sugars_100g: 'x' }).keys()]).toEqual([
      'energy-kcal', 'proteins', 'carbohydrates', 'fat', 'sodium',
    ]);
  });

  it('exige las cuatro: calorías, proteínas, carbohidratos y grasas', () => {
    expect(hasFourMacros(table)).toBe(true);
    expect(hasFourMacros({ ...table, fat_100g: undefined })).toBe(false);
    expect(hasFourMacros(null)).toBe(false);
  });
});

describe('sameBlock', () => {
  it('ignora el orden de las claves', () => {
    expect(sameBlock({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(sameBlock({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('diffCause', () => {
  it('detecta una conversión por mil', () => {
    expect(diffCause({ ...table, sodium_100g: 400 }, table)).toBe('conversion_x1000');
  });

  it('detecta un redondeo', () => {
    expect(diffCause({ ...table, proteins_100g: 8.04 }, table)).toBe('redondeo');
  });

  it('detecta claves de más o de menos cuando los valores coinciden', () => {
    expect(diffCause({ ...table, fiber_100g: 3 }, table)).toBe('superconjunto');
    expect(diffCause({ proteins_100g: 8 }, table)).toBe('subconjunto_de_fuente');
  });

  it('valores distintos sin relación simple es otra versión', () => {
    expect(diffCause({ ...table, proteins_100g: 20 }, table)).toBe('otra_version');
  });

  it('sin nutrientes en común no se puede comparar', () => {
    expect(diffCause({ fiber_100g: 1 }, { proteins_100g: 1 })).toBe('sin_claves_en_comun');
  });
});

describe('classifyFidelity', () => {
  it('A: igual a una de sus fuentes', () => {
    expect(classifyFidelity(table, [{ source: 'off', nutriments: { 'nova-group': 4 } }, { source: 'jumbo', nutriments: table }])).toEqual({
      clase: 'A', sub: 'igual_a_una_fuente',
    });
  });

  it('A: sin tabla guardada y ninguna fuente trae una real', () => {
    expect(classifyFidelity(null, [{ source: 'off', nutriments: { 'nova-group': 4 } }])).toEqual({
      clase: 'A', sub: 'ninguna_fuente_trae_tabla_real',
    });
  });

  it('B aunque lo guardado sea idéntico al bloque sin nutrientes de otra fuente (T-06)', () => {
    const nova = { 'nova-group': 4 };
    expect(classifyFidelity(nova, [{ source: 'off', nutriments: nova }, { source: 'jumbo', nutriments: table }])).toEqual({ clase: 'B' });
  });

  it('B: la tabla real se perdió (el caso de nova-group)', () => {
    expect(classifyFidelity({ 'nova-group': 4 }, [{ source: 'off', nutriments: { 'nova-group': 4, x: 1 } }, { source: 'jumbo', nutriments: table }])).toEqual({
      clase: 'B',
    });
    expect(classifyFidelity(null, [{ source: 'jumbo', nutriments: table }])).toEqual({ clase: 'B' });
  });

  it('C: difiere de todas, con causa y fuente más parecida', () => {
    expect(classifyFidelity({ ...table, sodium_100g: 400 }, [{ source: 'jumbo', nutriments: table }])).toEqual({
      clase: 'C', causa: 'conversion_x1000', fuente: 'jumbo',
    });
  });

  it('D: staging no tiene bloques', () => {
    expect(classifyFidelity(table, [])).toEqual({ clase: 'D' });
    expect(classifyFidelity(table, [{ source: 'off', nutriments: {} }, { source: 'jumbo', nutriments: null }])).toEqual({ clase: 'D' });
  });
});
