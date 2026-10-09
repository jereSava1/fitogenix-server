import { describe, expect, it } from 'vitest';
import { hasValidGtinCheckDigit, normalizeBarcode } from './barcode';

describe('normalizeBarcode', () => {
  it('deja un EAN-13 (13 dígitos) sin cambios', () => {
    expect(normalizeBarcode('7790895000010')).toBe('7790895000010');
  });

  it('convierte UPC-A (12 dígitos) a EAN-13 con 0 adelante', () => {
    expect(normalizeBarcode('012345678905')).toBe('0012345678905');
  });

  it('deja un EAN-8 (8 dígitos) sin cambios', () => {
    expect(normalizeBarcode('12345670')).toBe('12345670');
  });

  it('deja un GTIN-14 (14 dígitos) sin cambios', () => {
    expect(normalizeBarcode('12345678901231')).toBe('12345678901231');
  });

  it('recorta espacios antes de validar', () => {
    expect(normalizeBarcode('  7790895000010  ')).toBe('7790895000010');
  });

  it('devuelve null para largos que no son GTIN', () => {
    expect(normalizeBarcode('123')).toBeNull();
    expect(normalizeBarcode('123456789012345')).toBeNull();
    // 9, 10 y 11 dígitos tienen el dígito verificador correcto pero no son GTIN
    expect(normalizeBarcode('123456782')).toBeNull();
    expect(normalizeBarcode('1234567897')).toBeNull();
    expect(normalizeBarcode('12345678905')).toBeNull();
  });

  it('devuelve null si el dígito verificador no coincide', () => {
    expect(normalizeBarcode('7790895000013')).toBeNull();
    expect(normalizeBarcode('12345678')).toBeNull();
    expect(normalizeBarcode('012345678906')).toBeNull();
  });

  it('devuelve null si no son todos dígitos', () => {
    expect(normalizeBarcode('779089500001A')).toBeNull();
  });

  it('devuelve null para string vacío', () => {
    expect(normalizeBarcode('')).toBeNull();
  });
});

describe('hasValidGtinCheckDigit', () => {
  it('acepta códigos reales de Tonadita y Doritos', () => {
    expect(hasValidGtinCheckDigit('7798060850026')).toBe(true);
    expect(hasValidGtinCheckDigit('7790310983737')).toBe(true);
  });

  it('rechaza texto vacío, no numérico o de un dígito', () => {
    expect(hasValidGtinCheckDigit('')).toBe(false);
    expect(hasValidGtinCheckDigit('abc')).toBe(false);
    expect(hasValidGtinCheckDigit('7')).toBe(false);
  });
});
