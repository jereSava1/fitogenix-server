// Golden regression tests — congelan el comportamiento del motor sobre
// productos reales representativos ANTES del refactor de estructura de datos.
// Si un valor cambia sin querer, estos tests lo detectan.
//
// Los golden se capturaron con scripts/capture-golden.ts contra el motor
// original (pre-refactor). Excepción: `nutella_en` cambia intencionalmente
// cuando se agregan los aliases en inglés (ver comentario en su bloque).
import { describe, expect, it } from 'vitest';
import { ftgScoreWithBreakdown, ftgAnalyzeIngredients } from './ftgEngine';
import type { ProductInput } from './ftgEngine';

describe('ftgEngine — regresión sobre productos reales', () => {
  it('NOVA 1 alimento entero (huevos/avena) → Excelente', () => {
    const p: ProductInput = {
      ingredients_text: 'huevos, avena integral, banana, canela',
      nova_group: 1,
      nutriments: { 'proteins_100g': 13, 'sugars_100g': 5, 'saturated-fat_100g': 3, 'fiber_100g': 9, 'sodium_100g': 0.05 },
    };
    const bd = ftgScoreWithBreakdown(p);
    expect(bd.score).toBe(91);
    expect(bd.tier).toBe('Excelente');
    expect(bd.components).toMatchObject({
      toxicidad: { score: 90 }, nutricion: { score: 95 },
      procesamiento: { score: 95 }, alineacion: { score: 80 },
    });
  });

  it('Galletita ultraprocesada (español) → Moderado con gate off', () => {
    const p: ProductInput = {
      ingredients_text: 'harina de trigo, azúcar, aceite de girasol, jarabe de maíz de alta fructosa, sal',
      nova_group: 4,
      additives_tags: ['en:e322', 'en:e500'],
      nutriments: { 'sugars_100g': 30, 'saturated-fat_100g': 8, 'sodium_100g': 0.4, 'proteins_100g': 6, 'fiber_100g': 2 },
    };
    const bd = ftgScoreWithBreakdown(p);
    expect(bd.score).toBe(29);
    expect(bd.gateTriggered).toBeNull();
  });

  it('Gaseosa con aspartamo → gate techo 49', () => {
    const p: ProductInput = {
      ingredients_text: 'agua carbonatada, aspartamo, ácido fosfórico, cafeína',
      nova_group: 4,
      additives_tags: ['en:e951', 'en:e338'],
      nutriments: { 'sugars_100g': 0, 'sodium_100g': 0.02 },
    };
    const bd = ftgScoreWithBreakdown(p);
    expect(bd.score).toBe(48);
    expect(bd.score).toBeLessThanOrEqual(49);
    expect(bd.gateTriggered).not.toBeNull();
  });

  it('Margarina con grasa trans (PHO) → anulación 0-24', () => {
    const p: ProductInput = {
      ingredients_text: 'aceite vegetal parcialmente hidrogenado, agua, sal',
      nova_group: 4,
      nutriments: { 'trans-fat_100g': 2, 'saturated-fat_100g': 20, 'sodium_100g': 0.8 },
    };
    const bd = ftgScoreWithBreakdown(p);
    expect(bd.score).toBe(17);
    expect(bd.score).toBeLessThanOrEqual(24);
    expect(bd.gateTriggered).not.toBeNull();
  });

  it('Producto sin datos de ingredientes → fallback estable', () => {
    const bd = ftgScoreWithBreakdown({ ingredients_text: '', nutriments: {} });
    expect(bd.score).toBe(58);
    expect(bd.components).toMatchObject({
      toxicidad: { score: 60 }, nutricion: { score: 83 },
      procesamiento: { score: 40 }, alineacion: { score: 40 },
    });
  });

  // ── El fix real: aliases en inglés ──
  // Pre-fix (buggy): TODOS los ingredientes en inglés caían a 'yellow'
  // ("sin clasificación en nuestra base de datos"). Post-fix se clasifican
  // con su severidad real. El score puede o no cambiar — lo que importa es
  // que la UI ya no muestre todo como "sin clasificar".
  it('Nutella real de OFF (inglés) → clasifica cada ingrediente con su severidad', () => {
    const p: ProductInput = {
      ingredients_text: 'sugar, palm oil, hazelnuts, cocoa, skim milk, reduced minerals whey, lecithin as emulsifier, vanilla',
      nova_group: 4,
      nutriments: { 'sugars_100g': 44.2, 'saturated-fat_100g': 9.6, 'sodium_100g': 0.2, 'proteins_100g': 7.7, 'fiber_100g': 3.8 },
    };
    const ings = ftgAnalyzeIngredients(p);
    const sevOf = (needle: string) =>
      ings.find((i) => i.name.toLowerCase().includes(needle))?.sev;

    expect(sevOf('sugar')).toBe('orange');
    expect(sevOf('palm oil')).toBe('orange');
    expect(sevOf('cocoa')).toBe('green');
    expect(sevOf('whey')).toBe('green');
    expect(sevOf('vanilla')).toBe('green');

    // Ninguno debe quedar como "sin clasificación".
    const unclassified = ings.filter((i) => i.desc.includes('Sin clasificación'));
    expect(unclassified.map((i) => i.name)).not.toContain('sugar');
    expect(unclassified.map((i) => i.name)).not.toContain('palm oil');
  });
});
