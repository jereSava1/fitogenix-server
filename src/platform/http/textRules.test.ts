// Reglas de texto (PM-11): lo que aceptan y lo que rechazan, con el mismo Ajv que el server.
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { OpaqueToken, PersonName, SafeText } from './schemas';

const ajv = new Ajv();
const acepta = (schema: object, value: string) => ajv.validate(schema, value);

describe('SafeText', () => {
  const linea = SafeText({ maxLength: 200 });
  const multilinea = SafeText({ maxLength: 2000, multiline: true });

  it.each(['coca cola', 'Coca-Cola 1.5L', '7790895000123', 'Galletitas "Rhodesia" & café', 'ñandú 100%'])('acepta %j', (v) => {
    expect(acepta(linea, v)).toBe(true);
  });

  it.each(['<script>alert(1)</script>', 'a<b', 'a>b', 'tab\there', 'null\u0000', '   ', ''])('rechaza %j', (v) => {
    expect(acepta(linea, v)).toBe(false);
  });

  it('multilínea acepta saltos de línea; sigue rechazando HTML', () => {
    expect(acepta(multilinea, 'Hola,\nla app anda bien.\r\n¡Gracias!')).toBe(true);
    expect(acepta(multilinea, 'Hola\n<img src=x onerror=alert(1)>')).toBe(false);
    expect(acepta(multilinea, '\n\n')).toBe(false);
  });

  it('allowBlank acepta vacío', () => {
    expect(acepta(SafeText({ maxLength: 10, multiline: true, allowBlank: true }), '')).toBe(true);
  });
});

describe('OpaqueToken y PersonName', () => {
  it('token: base64url, puntos, guiones', () => {
    expect(acepta(OpaqueToken(4096), 'eyJhbGciOi.eyJzdWIiOi.c2ln-_+/=')).toBe(true);
    expect(acepta(OpaqueToken(4096), 'abc def')).toBe(false);
    expect(acepta(OpaqueToken(4096), '<x>')).toBe(false);
  });

  it('nombre: letras de cualquier idioma, sin HTML ni números', () => {
    for (const ok of ['Ana', 'María José', "O'Brien", 'Jean-Luc', 'Zoë']) expect(acepta(PersonName(), ok)).toBe(true);
    for (const mal of ['<b>', 'Ana1', ' Ana', '']) expect(acepta(PersonName(), mal)).toBe(false);
  });
});
