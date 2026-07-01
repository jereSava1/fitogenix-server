import { describe, it, expect } from 'vitest';
import {
  ingredientCount,
  ftgAnalyzeIngredients,
  ftgScoreWithBreakdown,
  type ProductInput,
} from './ftgEngine';

// ── 1. ingredientCount ──────────────────────────────────────────────────────

describe('ingredientCount', () => {
  it('returns 0 for undefined', () => {
    expect(ingredientCount(undefined)).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(ingredientCount('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(ingredientCount('   ')).toBe(0);
  });

  it('counts ingredients separated by commas', () => {
    expect(ingredientCount('agua, sal, azúcar')).toBe(3);
  });

  it('counts ingredients separated by semicolons', () => {
    expect(ingredientCount('agua; sal; azúcar; harina de trigo')).toBe(4);
  });

  it('counts mixed separators', () => {
    expect(ingredientCount('agua, sal; azúcar, harina de trigo, lecitina de soja')).toBe(5);
  });

  it('ignores single-character parts', () => {
    // trailing comma produces an empty/short part
    expect(ingredientCount('agua, sal,')).toBe(2);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ProductInput>): ProductInput {
  return {
    ingredients_text: '',
    nutriments: {},
    nova_group: undefined,
    additives_tags: [],
    ...overrides,
  };
}

// ── 2. Score >85 for all-green ingredients ──────────────────────────────────

describe('score with only green ingredients', () => {
  it('exceeds 85 for a product with whole-food green ingredients and good nutrition', () => {
    const product = makeProduct({
      ingredients_text: 'huevo, leche entera, mantequilla, cúrcuma, goma arábiga',
      nova_group: 1,
      nutriments: {
        'proteins_100g': 25,
        'fiber_100g': 8,
        'sugars_100g': 1,
        'saturated-fat_100g': 2,
        'sodium_100g': 0.05,
        'trans-fat_100g': 0,
      },
    });

    const { score } = ftgScoreWithBreakdown(product);
    expect(score).toBeGreaterThan(85);
  });
});

// ── 3. Score <70 in Capa B (alineacion) for palm/sunflower oil ─────────────

describe('score with palm oil and sunflower oil', () => {
  it('gives alineacion component below 70 for products with seed oils', () => {
    const product = makeProduct({
      ingredients_text: 'aceite de palma, aceite de girasol, harina de trigo, azúcar',
    });

    const { components } = ftgScoreWithBreakdown(product);
    // Capa B alignment penalises orange & red oils
    expect(components.alineacion.score).toBeLessThan(70);
  });

  it('gives overall score below 70 for a product high in palm/sunflower oils with no nutrients', () => {
    const product = makeProduct({
      ingredients_text: 'aceite de girasol, aceite de palma, harina de maíz, jarabe de glucosa, saborizante artificial',
      nova_group: 4,
      additives_tags: ['en:e621', 'en:e211', 'en:e320'],
    });

    const { score } = ftgScoreWithBreakdown(product);
    expect(score).toBeLessThan(70);
  });
});

// ── 4. Aspartame triggers Gate 3 → score ≤ 49 ──────────────────────────────

describe('Gate 3 — aspartame ceiling', () => {
  it('caps score at 49 when aspartame is in ingredient text', () => {
    const product = makeProduct({
      ingredients_text: 'agua carbonatada, aspartamo, ácido cítrico, saborizante artificial',
      nutriments: {
        'sugars_100g': 0,
        'sodium_100g': 0.05,
        'proteins_100g': 0,
        'fiber_100g': 0,
      },
    });

    const result = ftgScoreWithBreakdown(product);
    expect(result.score).toBeLessThanOrEqual(49);
    expect(result.gateTriggered).not.toBeNull();
    expect(result.gateTriggered).toContain('aspartamo');
  });

  it('caps score at 49 when aspartame is in additive tags', () => {
    const product = makeProduct({
      ingredients_text: 'agua, ácido cítrico',
      additives_tags: ['en:e951'],
    });

    const result = ftgScoreWithBreakdown(product);
    expect(result.score).toBeLessThanOrEqual(49);
    expect(result.gateTriggered).not.toBeNull();
  });
});

// ── 5. NOVA 4 with many additives — procesamiento penalisation ──────────────

describe('NOVA 4 with many additives', () => {
  it('gives procesamiento score of 10 and low overall score', () => {
    const product = makeProduct({
      ingredients_text:
        'harina de trigo, aceite de girasol, jarabe de glucosa, colorante, conservante, emulsionante, potenciador de sabor',
      nova_group: 4,
      additives_tags: ['en:e102', 'en:e211', 'en:e471', 'en:e621', 'en:e950', 'en:e129'],
      nutriments: {
        'sugars_100g': 20,
        'saturated-fat_100g': 8,
        'sodium_100g': 0.6,
        'proteins_100g': 3,
        'fiber_100g': 1,
      },
    });

    const { components, score } = ftgScoreWithBreakdown(product);
    // NOVA 4 maps to procesamiento score = 10
    expect(components.procesamiento.score).toBe(10);
    expect(components.procesamiento.nova).toBe(4);
    expect(score).toBeLessThan(50);
  });
});

// ── 6. ftgAnalyzeIngredients — known ingredient severities ──────────────────

describe('ftgAnalyzeIngredients', () => {
  it('marks aspartamo as red (Capa B)', () => {
    const product = makeProduct({ ingredients_text: 'aspartamo, agua, sal' });
    const analyzed = ftgAnalyzeIngredients(product);
    const aspartamo = analyzed.find((i) => i.name.toLowerCase().includes('aspartamo'));
    expect(aspartamo).toBeDefined();
    expect(aspartamo!.sev).toBe('red');
    expect(aspartamo!.flag).toBe(true);
  });

  it('marks aceite de girasol as red (Capa B)', () => {
    const product = makeProduct({ ingredients_text: 'aceite de girasol, sal' });
    const analyzed = ftgAnalyzeIngredients(product);
    const oil = analyzed.find((i) => i.name.toLowerCase().includes('aceite de girasol'));
    expect(oil).toBeDefined();
    expect(oil!.sev).toBe('red');
  });

  it('marks leche entera as green', () => {
    const product = makeProduct({ ingredients_text: 'leche entera, cacao, azúcar' });
    const analyzed = ftgAnalyzeIngredients(product);
    const leche = analyzed.find((i) => i.name.toLowerCase().includes('leche entera'));
    expect(leche).toBeDefined();
    expect(leche!.sev).toBe('green');
  });

  it('marks aceite de palma as orange (Capa B)', () => {
    const product = makeProduct({ ingredients_text: 'aceite de palma, harina de trigo' });
    const analyzed = ftgAnalyzeIngredients(product);
    const palma = analyzed.find((i) => i.name.toLowerCase().includes('aceite de palma'));
    expect(palma).toBeDefined();
    expect(palma!.sev).toBe('orange');
  });

  it('marks benzoato de sodio as red', () => {
    const product = makeProduct({ ingredients_text: 'agua, ácido cítrico, benzoato de sodio' });
    const analyzed = ftgAnalyzeIngredients(product);
    const ben = analyzed.find((i) => i.name.toLowerCase().includes('benzoato'));
    expect(ben).toBeDefined();
    expect(ben!.sev).toBe('red');
  });

  it('marks stevia as yellow', () => {
    const product = makeProduct({ ingredients_text: 'agua, stevia, ácido cítrico' });
    const analyzed = ftgAnalyzeIngredients(product);
    const stev = analyzed.find((i) => i.name.toLowerCase().includes('stevia'));
    expect(stev).toBeDefined();
    expect(stev!.sev).toBe('yellow');
  });

  it('returns empty array for empty ingredients text', () => {
    const product = makeProduct({ ingredients_text: '' });
    const analyzed = ftgAnalyzeIngredients(product);
    expect(analyzed).toHaveLength(0);
  });

  it('does not exceed 12 items', () => {
    const many = Array.from({ length: 20 }, (_, i) => `ingrediente${i}`).join(', ');
    const product = makeProduct({ ingredients_text: many });
    const analyzed = ftgAnalyzeIngredients(product);
    expect(analyzed.length).toBeLessThanOrEqual(12);
  });
});

// ── 7. ftgScoreWithBreakdown — structure validation ─────────────────────────

describe('ftgScoreWithBreakdown structure', () => {
  it('returns a breakdown with 4 numeric components', () => {
    const product = makeProduct({
      ingredients_text: 'leche entera, cacao, azúcar, mantequilla',
      nova_group: 3,
      nutriments: {
        'sugars_100g': 10,
        'saturated-fat_100g': 4,
        'sodium_100g': 0.1,
        'proteins_100g': 8,
        'fiber_100g': 3,
      },
    });

    const bd = ftgScoreWithBreakdown(product);

    expect(typeof bd.score).toBe('number');
    expect(bd.score).toBeGreaterThanOrEqual(0);
    expect(bd.score).toBeLessThanOrEqual(100);

    const { toxicidad, nutricion, procesamiento, alineacion } = bd.components;
    expect(typeof toxicidad.score).toBe('number');
    expect(typeof nutricion.score).toBe('number');
    expect(typeof procesamiento.score).toBe('number');
    expect(typeof alineacion.score).toBe('number');

    // Each component score is in valid range
    for (const comp of [toxicidad.score, nutricion.score, procesamiento.score, alineacion.score]) {
      expect(comp).toBeGreaterThanOrEqual(0);
      expect(comp).toBeLessThanOrEqual(100);
    }
  });

  it('sets tier correctly for known score ranges', () => {
    // Force a high-scoring product
    const goodProduct = makeProduct({
      ingredients_text: 'huevo, leche entera, mantequilla, avena integral, miel, ácido láctico',
      nova_group: 1,
      nutriments: {
        'proteins_100g': 30,
        'fiber_100g': 10,
        'sugars_100g': 1,
        'saturated-fat_100g': 1,
        'sodium_100g': 0.05,
      },
    });
    const good = ftgScoreWithBreakdown(goodProduct);
    expect(['Excelente', 'Bueno']).toContain(good.tier);

    // Force a low-scoring product with a gate
    const badProduct = makeProduct({
      ingredients_text: 'aceite parcialmente hidrogenado, jarabe de maíz de alta fructosa, saborizante artificial',
      nova_group: 4,
      additives_tags: ['en:e621', 'en:e211', 'en:e102'],
    });
    const bad = ftgScoreWithBreakdown(badProduct);
    expect(['Malo', 'Moderado']).toContain(bad.tier);
  });

  it('gateTriggered is null when no gate fires', () => {
    const product = makeProduct({
      ingredients_text: 'huevo, leche entera, avena, mantequilla',
      nova_group: 1,
    });
    const result = ftgScoreWithBreakdown(product);
    expect(result.gateTriggered).toBeNull();
  });

  it('trans-fat gate causes annulment (score ≤ 24)', () => {
    const product = makeProduct({
      ingredients_text: 'aceite parcialmente hidrogenado, azúcar, harina de trigo',
    });
    const result = ftgScoreWithBreakdown(product);
    expect(result.score).toBeLessThanOrEqual(24);
    expect(result.gateTriggered).not.toBeNull();
  });
});
