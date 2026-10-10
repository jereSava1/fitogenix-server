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

  it('completa con ceros un UPC-A recortado de 9 a 11 dígitos si el verificador valida', () => {
    expect(normalizeBarcode('70177029661')).toBe('0070177029661');
    expect(normalizeBarcode('1234567895')).toBe('0001234567895');
    expect(normalizeBarcode('123456784')).toBe('0000123456784');
  });

  it('descarta los de 9 a 11 dígitos cuyo verificador no valida', () => {
    expect(normalizeBarcode('70177029662')).toBeNull();
    expect(normalizeBarcode('1234567890')).toBeNull();
    expect(normalizeBarcode('123456785')).toBeNull();
  });

  it('devuelve null para largos que no son GTIN', () => {
    expect(normalizeBarcode('123')).toBeNull();
    expect(normalizeBarcode('248464')).toBeNull();
    expect(normalizeBarcode('123456789012345')).toBeNull();
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

describe('códigos de circulación restringida', () => {
  it('rechaza los EAN-13 de prefijo 20 a 29', () => {
    expect(normalizeBarcode('2000000046693')).toBeNull();
    expect(normalizeBarcode('2596536000006')).toBeNull();
  });

  it('rechaza también el prefijo 02 y el UPC-A de 12 dígitos que empieza con 2', () => {
    expect(normalizeBarcode('0212345678909')).toBeNull();
    expect(normalizeBarcode('212345678909')).toBeNull();
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
