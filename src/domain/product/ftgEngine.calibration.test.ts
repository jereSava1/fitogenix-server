// Golden set de calibración — fitogenix_scoring_engine_v1.md §9.
//
// §9 no es una lista de ejemplos ilustrativos: "estos ejemplos definen los
// extremos y puntos medios esperados del sistema". Son el contrato del motor.
// §11 pide validar contra 15-20 productos reales antes de producción y toma
// esta tabla como punto de partida — esto es ese punto de partida.
//
// Si un cambio en la rúbrica saca un producto de su banda, este test falla y
// hay que decidir explícitamente: o el cambio está mal, o §9 quedó vieja y se
// actualiza el documento primero. No tocar los rangos para que pase el test.
import { describe, expect, it } from 'vitest';
import { ftgScoreWithBreakdown, type ProductInput } from './ftgEngine';

type Case = {
  label: string;
  min: number;
  max: number;
  tier: string;
  product: ProductInput;
};

const CASES: Case[] = [
  {
    label: 'Agua mineral sin aditivos',
    min: 95, max: 100, tier: 'Excelente',
    product: { ingredients_text: 'agua mineral natural', nova_group: 1 },
  },
  {
    label: 'Aceite de oliva extra virgen (único ingrediente)',
    min: 88, max: 95, tier: 'Excelente',
    product: { ingredients_text: 'aceite de oliva extra virgen', nova_group: 2 },
  },
  {
    label: 'Manteca sin sal (crema de leche únicamente)',
    min: 82, max: 88, tier: 'Excelente',
    product: { ingredients_text: 'crema de leche pasteurizada', nova_group: 2 },
  },
  {
    label: 'Yogur entero natural (leche + fermentos)',
    min: 82, max: 88, tier: 'Excelente',
    product: {
      ingredients_text: 'leche entera, fermentos lácticos',
      nova_group: 3,
      nutriments: { 'sugars_100g': 4.5, 'proteins_100g': 3.5, 'sodium_100g': 0.05 },
    },
  },
  {
    label: 'Huevos frescos',
    min: 92, max: 96, tier: 'Excelente',
    product: { ingredients_text: 'huevos frescos', nova_group: 1 },
  },
  {
    label: 'Pechuga de pollo fresca sin aditivos',
    min: 88, max: 93, tier: 'Excelente',
    product: {
      ingredients_text: 'pechuga de pollo',
      nova_group: 1,
      nutriments: { 'proteins_100g': 23, 'sodium_100g': 0.07 },
    },
  },
  {
    label: 'Avena entera sin procesar',
    min: 82, max: 88, tier: 'Excelente',
    product: {
      ingredients_text: 'avena integral',
      nova_group: 1,
      nutriments: { 'fiber_100g': 10, 'proteins_100g': 13, 'sugars_100g': 1 },
    },
  },
  {
    label: 'Queso fresco simple sin aditivos',
    min: 78, max: 85, tier: 'Excelente',
    product: {
      ingredients_text: 'leche entera, sal, cuajo, fermentos lácticos',
      categories: 'Lácteos, Quesos, Queso fresco',
      nova_group: 3,
      nutriments: { 'proteins_100g': 18, 'sodium_100g': 0.4 },
    },
  },
  {
    label: 'Aceite de oliva refinado "suave" (no extra virgen)',
    min: 52, max: 62, tier: 'Bueno',
    product: { ingredients_text: 'aceite de oliva refinado', nova_group: 2 },
  },
  {
    // CONTRADICCIÓN DEL SPEC: §9 da 40-52 y lo etiqueta "Moderado", pero §1
    // define Moderado como 25-49 — la franja 50-52 es "Bueno". Se resuelve a
    // favor de §1 (la tabla de categorías es la normativa) y se apunta al
    // tramo consistente con las dos secciones. Si el criterio real era que
    // este producto puede ser "Bueno", hay que corregir §9 en el documento.
    label: 'Yogur con fruta y almidón modificado',
    min: 40, max: 49, tier: 'Moderado',
    product: {
      ingredients_text: 'leche entera, azúcar, pulpa de frutilla, almidón modificado, fermentos lácticos',
      nova_group: 4,
      nutriments: { 'sugars_100g': 12, 'proteins_100g': 3, 'sodium_100g': 0.06 },
    },
  },
  {
    label: 'Galletitas con aceite de girasol y azúcar',
    min: 28, max: 42, tier: 'Moderado',
    product: {
      ingredients_text: 'harina de trigo, azúcar, aceite de girasol, jarabe de maíz de alta fructosa, sal',
      nova_group: 4,
      additives_tags: ['en:e322', 'en:e500'],
      nutriments: { 'sugars_100g': 30, 'saturated-fat_100g': 8, 'sodium_100g': 0.4 },
    },
  },
  {
    label: 'Aceite de girasol refinado',
    min: 18, max: 28, tier: 'Malo',
    product: { ingredients_text: 'aceite de girasol', nova_group: 2 },
  },
  {
    label: 'Snack ultraprocesado con múltiples aditivos',
    min: 10, max: 25, tier: 'Malo',
    product: {
      ingredients_text:
        'harina de maíz, aceite de girasol, azúcar, sal, glutamato monosódico, saborizante artificial, colorante, emulsionante, almidón modificado',
      nova_group: 4,
      additives_tags: ['en:e621', 'en:e471', 'en:e211', 'en:e320'],
      nutriments: { 'sugars_100g': 8, 'sodium_100g': 1.2, 'saturated-fat_100g': 12 },
    },
  },
  {
    label: 'Fiambre industrial con nitrito sin ascorbato',
    min: 0, max: 15, tier: 'Malo',
    product: {
      ingredients_text: 'carne de cerdo, sal, nitrito de sodio, azúcar, saborizante',
      categories: 'Fiambres, Jamón cocido',
      nova_group: 4,
      additives_tags: ['en:e250'],
    },
  },
  {
    label: 'Producto con aceite parcialmente hidrogenado',
    min: 0, max: 12, tier: 'Malo',
    product: {
      ingredients_text: 'aceite vegetal parcialmente hidrogenado, agua, sal',
      nova_group: 4,
      nutriments: { 'trans-fat_100g': 2, 'saturated-fat_100g': 20, 'sodium_100g': 0.8 },
    },
  },
  {
    label: 'Producto con dióxido de titanio (E171)',
    min: 0, max: 15, tier: 'Malo',
    product: {
      ingredients_text: 'azúcar, jarabe de glucosa, dióxido de titanio, saborizante artificial',
      nova_group: 4,
      additives_tags: ['en:e171'],
    },
  },
];

describe('§9 — golden set de calibración', () => {
  for (const c of CASES) {
    it(`${c.label} → ${c.min}-${c.max} (${c.tier})`, () => {
      const bd = ftgScoreWithBreakdown(c.product);
      expect(bd.score).toBeGreaterThanOrEqual(c.min);
      expect(bd.score).toBeLessThanOrEqual(c.max);
      expect(bd.tier).toBe(c.tier);
    });
  }

  // §11 — "El mismo producto con los mismos ingredientes debe producir
  // siempre el mismo puntaje." Sin esto, los rangos de §3.1 podrían tentar a
  // alguien a devolver un valor aleatorio dentro de la banda.
  it('es determinista: mismo input, mismo puntaje', () => {
    for (const c of CASES) {
      const a = ftgScoreWithBreakdown(c.product).score;
      const b = ftgScoreWithBreakdown(c.product).score;
      expect(a).toBe(b);
    }
  });
});
