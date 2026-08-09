// Golden regression tests — congelan el comportamiento del motor sobre
// productos reales representativos. Si un valor cambia sin querer, estos
// tests lo detectan.
//
// Los números se re-capturaron al pasar a la rúbrica v1.0
// (fitogenix_scoring_engine_v1.md). Los goldens de v1 NO son comparables:
// cambió la arquitectura entera del puntaje (de promedio ponderado de 4 ejes
// a base por ingredientes + modificadores) y también los umbrales de §1.
// Cada bloque anota qué esperaba v1 y por qué cambió — sin eso, un diff de
// este archivo parece una regresión.
//
// La calibración contra la tabla de §9 vive aparte, en
// ftgEngine.calibration.test.ts. Este archivo cubre casos que §9 no incluye.
import { describe, expect, it } from 'vitest';
import { ftgScoreWithBreakdown, ftgAnalyzeIngredients } from './ftgEngine';
import type { ProductInput } from './ftgEngine';

describe('ftgEngine — regresión sobre productos reales', () => {
  // v1: 91. Sube porque §3.1 le da base de arquetipo (alimento entero, todos
  // los ingredientes sin penalización) en vez de promediar cuatro ejes.
  it('NOVA 1 alimento entero (huevos/avena) → Excelente', () => {
    const p: ProductInput = {
      ingredients_text: 'huevos, avena integral, banana, canela',
      nova_group: 1,
      nutriments: { 'proteins_100g': 13, 'sugars_100g': 5, 'saturated-fat_100g': 3, 'fiber_100g': 9, 'sodium_100g': 0.05 },
    };
    const bd = ftgScoreWithBreakdown(p);
    expect(bd.score).toBe(96);
    expect(bd.tier).toBe('Excelente');
    // El techo del arquetipo (§3.1) impide que el bonus NOVA 1 lo empuje más.
    expect(bd.components.alineacion.score).toBe(94);
  });

  // v1: 29. Prácticamente igual, por caminos distintos: v1 lo hundía con el
  // 25% de peso del eje NOVA, v2 con las penalizaciones de ingredientes de
  // §3.2 más un modificador NOVA acotado.
  it('Galletita ultraprocesada (español) → Moderado sin compuerta', () => {
    const p: ProductInput = {
      ingredients_text: 'harina de trigo, azúcar, aceite de girasol, jarabe de maíz de alta fructosa, sal',
      nova_group: 4,
      additives_tags: ['en:e322', 'en:e500'],
      nutriments: { 'sugars_100g': 30, 'saturated-fat_100g': 8, 'sodium_100g': 0.4, 'proteins_100g': 6, 'fiber_100g': 2 },
    };
    const bd = ftgScoreWithBreakdown(p);
    expect(bd.score).toBe(30);
    expect(bd.tier).toBe('Moderado');
    expect(bd.gateTriggered).toBeNull();
  });

  // CAMBIO DE CRITERIO. v1: 48 con compuerta de techo 49 por aspartamo.
  // §3.2 clasifica los edulcorantes sintéticos como impacto medio y no los
  // incluye en las anulaciones de §4.1, así que la compuerta desaparece. El
  // producto queda parecido, pero ahora por penalización y no por techo.
  it('Gaseosa con aspartamo → penaliza, sin compuerta', () => {
    const p: ProductInput = {
      ingredients_text: 'agua carbonatada, aspartamo, ácido fosfórico, cafeína',
      nova_group: 4,
      additives_tags: ['en:e951', 'en:e338'],
      nutriments: { 'sugars_100g': 0, 'sodium_100g': 0.02 },
    };
    const bd = ftgScoreWithBreakdown(p);
    expect(bd.score).toBe(46);
    expect(bd.gateTriggered).toBeNull();
  });

  // v1: 17. Baja porque §9 pide 0-12 para un producto con PHO y la banda de
  // anulación se recalibró contra esa tabla.
  it('Margarina con grasa trans (PHO) → anulación 0-24', () => {
    const p: ProductInput = {
      ingredients_text: 'aceite vegetal parcialmente hidrogenado, agua, sal',
      nova_group: 4,
      nutriments: { 'trans-fat_100g': 2, 'saturated-fat_100g': 20, 'sodium_100g': 0.8 },
    };
    const bd = ftgScoreWithBreakdown(p);
    expect(bd.score).toBe(10);
    expect(bd.tier).toBe('Malo');
    expect(bd.gateTriggered).not.toBeNull();
  });

  // v1: 58 — un producto del que no sabíamos nada salía "Moderado" tirando a
  // bueno, por los fallbacks optimistas de los cuatro ejes. §11 es explícito:
  // "si Open Food Facts no tiene lista de ingredientes, no generar puntaje".
  // El motor devuelve un número conservador y marca scoreAvailable=false para
  // que el consumidor decida si mostrarlo.
  it('Producto sin datos de ingredientes → no hay puntaje real (§11)', () => {
    const bd = ftgScoreWithBreakdown({ ingredients_text: '', nutriments: {} });
    expect(bd.scoreAvailable).toBe(false);
    expect(bd.score).toBe(40);
  });

  it('Producto CON ingredientes marca scoreAvailable', () => {
    const bd = ftgScoreWithBreakdown({ ingredients_text: 'agua mineral natural', nova_group: 1 });
    expect(bd.scoreAvailable).toBe(true);
  });

  // ── Aliases en inglés: OFF devuelve las etiquetas en el idioma original ──
  it('Nutella real de OFF (inglés) → clasifica cada ingrediente con su severidad', () => {
    const p: ProductInput = {
      ingredients_text: 'sugar, palm oil, hazelnuts, cocoa, skim milk, reduced minerals whey, lecithin as emulsifier, vanilla',
      nova_group: 4,
      nutriments: { 'sugars_100g': 44.2, 'saturated-fat_100g': 9.6, 'sodium_100g': 0.2, 'proteins_100g': 7.7, 'fiber_100g': 3.8 },
    };
    const ings = ftgAnalyzeIngredients(p);
    const sevOf = (needle: string) =>
      ings.find((i) => i.name.toLowerCase().includes(needle))?.sev;

    // El azúcar sube de 'orange' (v1) a 'red': §3.2 la pone en impacto alto
    // cuando aparece entre los primeros 3 ingredientes, y acá es la primera.
    expect(sevOf('azúcar')).toBe('red');
    // El aceite de palma no está en las tablas del spec: lo resuelve
    // ingredientData, que es el respaldo cuando §3.2 no opina.
    expect(sevOf('aceite de palma')).toBe('orange');
    expect(sevOf('cacao')).toBe('green');
    expect(sevOf('vainilla')).toBe('green');
    // "lecithin as emulsifier" cae en el registro genérico de emulsionante
    // → impacto medio (§3.2).
    expect(sevOf('emulsionante')).toBe('orange');

    // Los nombres mostrados están en español, no en el inglés original de OFF.
    const names = ings.map((i) => i.name.toLowerCase());
    expect(names).not.toContain('sugar');
    expect(names).not.toContain('palm oil');
  });
});
