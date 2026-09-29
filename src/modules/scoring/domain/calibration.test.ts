// Golden de calibración (§8): cada fila verifica el número y que el desglose lo reconstruya.
// Si un cambio saca un producto de su banda, se decide a propósito: o el cambio está mal o
// §8 se actualiza primero. No tocar los rangos para que pase.
import { describe, expect, it } from 'vitest';
import { scoreProduct, type ProductInput, type ScoreBreakdown } from '../index';

type Case = {
  label: string;
  /** Puntaje exacto de la columna "Resultado" de §8. */
  expected: number;
  tier: string;
  product: ProductInput;
  /** La cuenta que escribe §8, para dejarla a la vista en el test. */
  arithmetic?: string;
};

const CASES: Case[] = [
  {
    label: 'Agua mineral',
    arithmetic: 'Ancla → 95-100',
    expected: 98, tier: 'Excelente',
    product: { ingredients_text: 'agua mineral natural' },
  },
  {
    label: 'Yogur natural (leche + fermentos)',
    arithmetic: 'Ancla → 82-90',
    expected: 86, tier: 'Excelente',
    product: { ingredients_text: 'leche entera, fermentos lácticos' },
  },
  {
    label: 'Aceite de girasol refinado',
    arithmetic: 'Ancla negativa → 18-28',
    expected: 23, tier: 'Malo',
    product: { ingredients_text: 'aceite de girasol' },
  },
  {
    label: 'Galletita',
    arithmetic: '75 −13 −13 −13 −6',
    expected: 30, tier: 'Moderado',
    product: {
      ingredients_text: 'harina de trigo 000, azúcar, aceite de girasol, jarabe de glucosa, sal',
    },
  },
  {
    label: 'Yogur con fruta',
    arithmetic: '75 −13 −3 −1 = 58; ultraprocesado (2 marcadores) −10',
    expected: 48, tier: 'Moderado',
    product: {
      ingredients_text: 'leche, azúcar, pulpa de frutilla, almidón modificado, fermentos lácticos, aroma',
    },
  },
  {
    label: 'Snack ultraprocesado',
    arithmetic: '75 −13 −13 −3 −6 −6 −3 = 31; ultraprocesado (4 marcadores) −15',
    expected: 16, tier: 'Malo',
    product: {
      ingredients_text:
        'harina de maíz, aceite de girasol, sal, glutamato monosódico, saborizante artificial, E110, E471',
    },
  },
  {
    label: 'Fiambre curado sin ascorbato',
    arithmetic: 'Anulación × 1: 20 − 6',
    expected: 14, tier: 'Malo',
    product: {
      ingredients_text: 'carne de cerdo, sal, nitrito de sodio',
      categories: 'Fiambres, Jamón cocido',
    },
  },
  {
    label: 'Fiambre "curado natural" con apio',
    arithmetic: 'Anulación × 1',
    expected: 14, tier: 'Malo',
    product: {
      ingredients_text: 'carne de cerdo, sal, polvo de apio',
      categories: 'Fiambres',
    },
  },
  {
    label: 'Barrita proteica',
    arithmetic: '75 −3 −13 −3 −3 = 53; ultraprocesado −10',
    expected: 43, tier: 'Moderado',
    product: {
      ingredients_text: 'whey isolate, jarabe de arroz, cacao, aceite de palma, sucralosa',
    },
  },
];

describe('§8 — golden set de calibración', () => {
  for (const c of CASES) {
    it(`${c.label} → ${c.expected}${c.arithmetic ? ` (${c.arithmetic})` : ''}`, () => {
      const bd = scoreProduct(c.product);
      expect(bd.score).toBe(c.expected);
      expect(bd.tier).toBe(c.tier);
    });
  }

  // ── Casos de "no se puntúa" (§1) ──

  it('3 ingredientes inventados → sin datos', () => {
    const bd = scoreProduct({
      ingredients_text: 'zorbalina, kritamina fosforada, veltrexol',
    });
    expect(bd.score).toBeNull();
    expect(bd.scoreAvailable).toBe(false);
    expect(bd.noScore?.code).toBe('sin-identificar');
  });

  it('"Sin TACC, Kosher, Vegano" → sin ingredientes tras limpiar', () => {
    const bd = scoreProduct({ ingredients_text: 'Sin TACC, Kosher, Vegano' });
    expect(bd.score).toBeNull();
    expect(bd.noScore?.code).toBe('solo-certificaciones');
  });

  it('la traza de aceite parcialmente hidrogenado no anula', () => {
    const bd = scoreProduct({
      ingredients_text: 'agua, sal, trazas de aceite parcialmente hidrogenado',
    });
    expect(bd.annulments).toHaveLength(0);
    expect(bd.allergenWarnings[0]).toContain('trazas');
    // §8 anota 75, pero el Paso 3 suma +5 a un producto sin marcadores que ya va ≥70:
    // se implementa la regla, no la celda (75 + 5 = 80).
    expect(bd.score).toBe(80);
  });

  it('vino y cerveza → fuera de alcance', () => {
    for (const name of ['Vino tinto Malbec', 'Cerveza rubia']) {
      const bd = scoreProduct({ product_name: name });
      expect(bd.score).toBeNull();
      expect(bd.noScore?.code).toBe('fuera-de-alcance');
    }
  });

  it('fórmula infantil → fuera de alcance', () => {
    const bd = scoreProduct({
      product_name: 'Fórmula infantil etapa 1',
      ingredients_text: 'lactosa, aceites vegetales, proteína de suero',
    });
    expect(bd.score).toBeNull();
    expect(bd.noScore?.message).toContain('pediatra');
  });

  // ── Las dos reglas que gobiernan todo (§ROL) ──

  it('regla 1 — el desglose reconstruye el puntaje', () => {
    for (const c of CASES) {
      const bd = scoreProduct(c.product);
      expectStepsReconstructScore(bd, c.label);
    }
  });

  it('es determinista: mismo input, mismo puntaje', () => {
    for (const c of CASES) {
      const a = scoreProduct(c.product).score;
      const b = scoreProduct(c.product).score;
      expect(a).toBe(b);
    }
  });
});

/** La cuenta cierra: cada `delta` mueve el `running` en exactamente eso, y el último es el score. */
export function expectStepsReconstructScore(bd: ScoreBreakdown, label = '') {
  if (bd.score == null) return;
  expect(bd.steps.length, `${label}: sin desglose`).toBeGreaterThan(0);

  let running: number | null = null;
  for (const step of bd.steps) {
    if (step.delta != null && running != null) {
      expect(running + step.delta, `${label}: paso "${step.label}" no cierra`).toBe(step.running);
    }
    running = step.running;
  }
  expect(bd.steps[bd.steps.length - 1].running, `${label}: último paso ≠ score`).toBe(bd.score);
}
