import { describe, expect, it } from 'vitest';
import {
  decideNutritionBlock,
  hasImpossibleNutrition,
  planAiCleanup,
  planAiFlagOff,
  planNutritionBlock,
  planNutrimentValue,
  type PurgeRow,
} from './purgePlan';

const row = (over: Partial<PurgeRow> = {}): PurgeRow => ({
  id: 'id-1',
  barcode: '7790310983737',
  data_source: 'off',
  ai_enriched: false,
  ingredients_text: 'harina',
  nutriments: { sodium_100g: 0.664, salt_100g: 1.66 },
  additives_tags: null,
  ...over,
});

describe('planAiCleanup', () => {
  it('toma solo las filas ai_enriched y las vacía, guardando lo anterior', () => {
    const rows = [row(), row({ id: 'id-2', ai_enriched: true, additives_tags: ['en:e330'] })];
    const plan = planAiCleanup(rows);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      id: 'id-2',
      before: { ingredients_text: 'harina', additives_tags: ['en:e330'] },
      after: { ingredients_text: null, nutriments: null, additives_tags: null },
    });
  });
});

describe('planAiFlagOff', () => {
  it('pasa a false solo las filas ai_enriched ya vaciadas', () => {
    const rows = [row(), row({ id: 'id-2', ai_enriched: true, ingredients_text: null, nutriments: null })];
    expect(planAiFlagOff(rows)).toEqual([
      expect.objectContaining({ id: 'id-2', before: { ai_enriched: true }, after: { ai_enriched: false } }),
    ]);
  });

  it('falla si una fila ai_enriched todavía trae datos', () => {
    expect(() => planAiFlagOff([row({ ai_enriched: true })])).toThrow(/vaciar antes/);
  });
});

describe('planNutrimentValue', () => {
  it('cambia un solo valor y conserva el resto del bloque', () => {
    const [change] = planNutrimentValue([row()], '7790310983737', 'sodium_100g', 0.664, 0.672, 'D-97');
    expect(change.after).toEqual({ nutriments: { sodium_100g: 0.672, salt_100g: 1.66 } });
    expect(change.before).toEqual({ nutriments: { sodium_100g: 0.664, salt_100g: 1.66 } });
  });

  it('falla si el valor de hoy no es el esperado o la fila no es única', () => {
    expect(() => planNutrimentValue([row()], '7790310983737', 'sodium_100g', 0.5, 0.672, 'x')).toThrow(/esperaba/);
    expect(() => planNutrimentValue([], '7790310983737', 'sodium_100g', 0.664, 0.672, 'x')).toThrow(/1 fila/);
  });
});

describe('ola 3', () => {
  it('reconoce nutrición imposible (rango o relación)', () => {
    expect(hasImpossibleNutrition({ sodium_100g: 900 })).toBe(true);
    expect(hasImpossibleNutrition({ sugars_100g: 30, carbohydrates_100g: 10 })).toBe(true);
    expect(hasImpossibleNutrition({ sugars_100g: 5, carbohydrates_100g: 10 })).toBe(false);
  });

  it('reemplaza el bloque entero si la fuente trae uno coherente', () => {
    const source = { 'energy-kcal_100g': 300, sugars_100g: 5, carbohydrates_100g: 40 };
    expect(decideNutritionBlock(source)).toEqual({ action: 'reemplazar', nutriments: source });
  });

  it('vacía si la fuente no trae tabla o trae una imposible', () => {
    expect(decideNutritionBlock(null).action).toBe('vaciar');
    expect(decideNutritionBlock({ 'nova-group': 4 }).action).toBe('vaciar');
    expect(decideNutritionBlock({ sodium_100g: 900 }).action).toBe('vaciar');
  });

  it('el plan lleva el bloque anterior y el nuevo', () => {
    const r = row({ nutriments: { sodium_100g: 900 } });
    const change = planNutritionBlock(r, { action: 'vaciar', motivo: 'm' }, 'off');
    expect(change.before).toEqual({ nutriments: { sodium_100g: 900 } });
    expect(change.after).toEqual({ nutriments: null });
    expect(change.reason).toContain('se vacía');
  });
});
