import { describe, expect, it } from 'vitest';
import { normalizeBarcode } from './barcode';

describe('normalizeBarcode', () => {
  it('deja un EAN-13 (13 dígitos) sin cambios', () => {
    expect(normalizeBarcode('7790895000013')).toBe('7790895000013');
  });

  it('convierte UPC-A (12 dígitos) a EAN-13 con 0 adelante', () => {
    expect(normalizeBarcode('012345678905')).toBe('0012345678905');
  });

  it('deja un EAN-8 (8 dígitos) sin cambios', () => {
    expect(normalizeBarcode('12345678')).toBe('12345678');
  });

  it('deja un GTIN-14 (14 dígitos) sin cambios', () => {
    expect(normalizeBarcode('12345678901234')).toBe('12345678901234');
  });

  it('recorta espacios antes de validar', () => {
    expect(normalizeBarcode('  7790895000013  ')).toBe('7790895000013');
  });

  it('devuelve null para largos inválidos', () => {
    expect(normalizeBarcode('123')).toBeNull();
    expect(normalizeBarcode('123456789012345')).toBeNull();
  });

  it('devuelve null si no son todos dígitos', () => {
    expect(normalizeBarcode('779089500001A')).toBeNull();
  });

  it('devuelve null para string vacío', () => {
    expect(normalizeBarcode('')).toBeNull();
  });
});
