import { describe, expect, it } from 'vitest';
import { checkIngredientsText, findBrandInName } from './qualityHeuristics';
// findImplausibleNutrients ahora vive (y se testea) en
// src/domain/product/nutrientPlausibility.test.ts — compartido con
// claudeService.ts, no es exclusivo de este módulo. Ver el re-export en
// qualityHeuristics.ts si algo todavía lo importa desde acá.

describe('checkIngredientsText', () => {
  it('no marca una lista de ingredientes normal', () => {
    const result = checkIngredientsText('harina de trigo, azúcar, cacao, manteca, sal');
    expect(result.suspect).toBe(false);
  });

  it('no marca un ingrediente único corto (falso positivo típico)', () => {
    const result = checkIngredientsText('Agua');
    expect(result.suspect).toBe(false);
  });

  it('marca texto con "elaborado por"', () => {
    const result = checkIngredientsText('Elaborado por Molinos SA, Ruta 9 Km 50, Buenos Aires');
    expect(result.suspect).toBe(true);
    expect(result.reasons.some((r) => r.includes('elaborado por/en'))).toBe(true);
  });

  it('marca texto con código postal argentino (CPA)', () => {
    const result = checkIngredientsText('Establecimiento habilitado, B1875ABC Wilde, Pcia. Buenos Aires');
    expect(result.suspect).toBe(true);
  });

  it('marca texto largo sin comas cuando ya hay otra señal', () => {
    const result = checkIngredientsText(
      'Elaborado en establecimiento habilitado por el organismo de contralor correspondiente en la provincia',
    );
    expect(result.suspect).toBe(true);
    expect(result.reasons.some((r) => r.includes('poca estructura de lista'))).toBe(true);
  });

  it('devuelve suspect=false para texto vacío o null', () => {
    expect(checkIngredientsText('').suspect).toBe(false);
    expect(checkIngredientsText(null).suspect).toBe(false);
    expect(checkIngredientsText(undefined).suspect).toBe(false);
  });
});

describe('findBrandInName', () => {
  it('encuentra una marca conocida embebida en el nombre', () => {
    const result = findBrandInName('Leche Entera La Serenísima 1L', ['La Serenísima', 'Sancor', 'Ilolay']);
    expect(result).toBe('La Serenísima');
  });

  it('devuelve null si ninguna marca conocida aparece', () => {
    const result = findBrandInName('Producto genérico sin marca', ['Sancor', 'Ilolay']);
    expect(result).toBeNull();
  });

  it('prefiere la marca más larga/específica si hay solapamiento', () => {
    const result = findBrandInName('Aceite Molinos Río de la Plata 900ml', ['Molinos Río de la Plata', 'Molinos']);
    expect(result).toBe('Molinos Río de la Plata');
  });

  it('hace match de palabra completa, no substring parcial', () => {
    // "Sol" no debería matchear dentro de "Solera" u otra palabra que la contenga.
    const result = findBrandInName('Vino Solera Reserva', ['Sol']);
    expect(result).toBeNull();
  });

  it('devuelve null si product_name es null', () => {
    expect(findBrandInName(null, ['Sancor'])).toBeNull();
  });

  it('ignora marcas candidatas demasiado cortas (< 3 caracteres)', () => {
    const result = findBrandInName('Yerba La Merced', ['La']);
    expect(result).toBeNull();
  });
});
