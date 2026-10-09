import { describe, expect, it } from 'vitest';
import { duplicateVerdict, fieldsToPass, isRestrictedCirculationCode, hasContent, reproducibleSample, zeroPaddedCandidate, type RepairRow } from './barcodeRepair';

const row = (over: Partial<RepairRow> = {}): RepairRow => ({
  id: 'a', barcode: '70177029661', data_source: 'jumbo', product_name: 'Té', ingredients_text: null, nutriments: null, ...over,
});

describe('zeroPaddedCandidate', () => {
  it('completa a 13 un UPC-A al que le falta el cero inicial', () => {
    expect(zeroPaddedCandidate('70177029661')).toBe('0070177029661');
  });

  it('no completa si el verificador no da, ni códigos fuera de 9 a 11 dígitos', () => {
    expect(zeroPaddedCandidate('70177029662')).toBeNull();
    expect(zeroPaddedCandidate('248464')).toBeNull();
    expect(zeroPaddedCandidate('7798060850026')).toBeNull();
    expect(zeroPaddedCandidate('7017702966A')).toBeNull();
    expect(zeroPaddedCandidate(null)).toBeNull();
  });
});

describe('hasContent', () => {
  it('cuenta ingredientes o cualquier clave de nutrición', () => {
    expect(hasContent(row())).toBe(false);
    expect(hasContent(row({ ingredients_text: 'agua' }))).toBe(true);
    expect(hasContent(row({ nutriments: { a: 1 } }))).toBe(true);
    expect(hasContent(row({ ingredients_text: '  ', nutriments: {} }))).toBe(false);
  });
});

describe('reproducibleSample', () => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({ id: String(i).padStart(4, '0') }));

  it('toma una de cada N ordenada por id y es la misma cada vez', () => {
    const a = reproducibleSample([...rows].reverse(), 100);
    expect(a).toHaveLength(100);
    expect(a[1].id).toBe('0010');
    expect(reproducibleSample(rows, 100)).toEqual(a);
  });

  it('devuelve todo si hay menos filas que el tamaño', () => {
    expect(reproducibleSample(rows.slice(0, 5), 100)).toHaveLength(5);
  });
});

describe('duplicateVerdict', () => {
  const other = row({ id: 'b', barcode: '0070177029661', ingredients_text: 'hojas de té' });

  it('borra la inválida si está vacía y nadie la referencia', () => {
    expect(duplicateVerdict(row(), other, false)).toBe('borrar');
  });

  it('va a la lista si tiene datos o la referencian', () => {
    expect(duplicateVerdict(row({ ingredients_text: 'té' }), other, false)).toBe('lista');
    expect(duplicateVerdict(row(), other, true)).toBe('lista');
  });
});

describe('fieldsToPass', () => {
  const usable = (n: Record<string, unknown> | null) => Boolean(n && 'sodium_100g' in n);
  const base = { id: 'x', barcode: '1', data_source: 'off', product_name: 'p' };
  const keeper = (over = {}) => ({ ...base, ingredients_text: null, nutriments: null, brand: null, image_url: null, ...over });

  it('pasa lo que a la que queda le falta y la duplicada tiene, campo completo', () => {
    const dup = keeper({ ingredients_text: 'agua', nutriments: { sodium_100g: 1, fat_100g: 2 }, brand: 'M', image_url: 'http://i' });
    expect(fieldsToPass(keeper(), dup, usable)).toEqual({
      ingredients_text: 'agua', nutriments: { sodium_100g: 1, fat_100g: 2 }, brand: 'M', image_url: 'http://i',
    });
  });

  it('si las dos lo tienen no pisa nada', () => {
    const both = keeper({ ingredients_text: 'a', nutriments: { sodium_100g: 1 }, brand: 'M', image_url: 'u' });
    expect(fieldsToPass(both, keeper({ ingredients_text: 'b', nutriments: { sodium_100g: 9 }, brand: 'N', image_url: 'v' }), usable)).toEqual({});
  });

  it('no pasa un bloque de nutrición que no sirve', () => {
    expect(fieldsToPass(keeper(), keeper({ nutriments: { 'nova-group': 4 } }), usable)).toEqual({});
  });
});

describe('isRestrictedCirculationCode', () => {
  it('reconoce los EAN-13 de prefijo 20 a 29', () => {
    expect(isRestrictedCirculationCode('2000000046692')).toBe(true);
    expect(isRestrictedCirculationCode('2912345678908')).toBe(true);
  });

  it('no marca el prefijo 02 (pendiente) ni los demás', () => {
    expect(isRestrictedCirculationCode('0212345678905')).toBe(false);
    expect(isRestrictedCirculationCode('7798060850026')).toBe(false);
    expect(isRestrictedCirculationCode('0012345678905')).toBe(false);
    expect(isRestrictedCirculationCode('212345678905')).toBe(false);
    expect(isRestrictedCirculationCode(null)).toBe(false);
  });
});
