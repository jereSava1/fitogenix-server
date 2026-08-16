/* Golden regression — congela el puntaje de productos reales representativos
 * de la góndola argentina. Si un valor cambia sin querer, esto lo detecta.
 *
 * Los números se re-capturaron al pasar a v2.1. Los goldens de v2 NO son
 * comparables: cambió la arquitectura entera del puntaje (de base compuesta
 * con penalización decreciente + modificador NOVA + regresión por cobertura,
 * a base 75 con restas fijas por posición + modificador de procesamiento).
 * Cada bloque anota por qué el número es el que es — sin eso, un diff de este
 * archivo parece una regresión.
 *
 * La calibración contra §8 vive en ftgEngine.calibration.test.ts. Acá van los
 * productos que §8 no incluye.
 */
import { describe, expect, it } from 'vitest';
import { scoreProduct, type ProductInput } from './index';
import { expectStepsReconstructScore } from './calibration.test';

type Golden = { label: string; expected: number; tier: string; why: string; product: ProductInput };

const GOLDENS: Golden[] = [
  {
    label: 'Coca-Cola',
    expected: 13, tier: 'Malo',
    why: 'Ancla negativa "bebida azucarada carbonatada" (8-18). El ancla gana sobre la cuenta por ingrediente: el producto ES una gaseosa azucarada.',
    product: {
      product_name: 'Coca-Cola', categories: 'Bebidas, Gaseosas',
      ingredients_text: 'agua carbonatada, azúcar, colorante caramelo E150d, acidulante ácido fosfórico, aromas naturales, cafeína',
      nutriments: { 'sugars_100g': 10.6, 'energy-kcal_100g': 42, 'sodium_100g': 0.005 },
    },
  },
  {
    label: 'Coca-Cola Zero',
    expected: 47, tier: 'Moderado',
    why: 'Sin azúcar no cae en el ancla de la gaseosa azucarada. Penalizan el colorante, el acidulante y los dos edulcorantes sintéticos, más el modificador de procesamiento.',
    product: {
      product_name: 'Coca-Cola Zero', categories: 'Bebidas, Gaseosas',
      ingredients_text: 'agua carbonatada, colorante caramelo E150d, acidulante ácido fosfórico, edulcorantes aspartamo y acesulfame K, aromas, cafeína',
      nutriments: { 'sugars_100g': 0, 'energy-kcal_100g': 1 },
    },
  },
  {
    label: 'Galletitas tipo Oreo',
    expected: 12, tier: 'Malo',
    why: 'Harina refinada + azúcar + aceite vegetal sin especificar ocupan las tres primeras posiciones: −39 antes de tocar el resto. Ya viene por debajo del piso nutricional, así que el panel no lo mueve.',
    product: {
      product_name: 'Galletitas de chocolate rellenas',
      ingredients_text: 'harina de trigo, azúcar, aceite vegetal, cacao alcalinizado, jarabe de glucosa, leudantes, sal, emulsionante lecitina de soja, saborizante',
      nutriments: { 'sugars_100g': 38, 'saturated-fat_100g': 9, 'energy-kcal_100g': 480, 'sodium_100g': 0.4 },
    },
  },
  {
    label: 'Yogur natural entero',
    expected: 86, tier: 'Excelente',
    why: 'Ancla de yogur (82-90) por composición: leche + fermentos, sin que la palabra "yogur" aparezca en el listado.',
    product: {
      product_name: 'Yogur natural', categories: 'Lácteos, Yogures',
      ingredients_text: 'leche parcialmente descremada, fermentos lácticos',
      nutriments: { 'sugars_100g': 4.7, 'energy-kcal_100g': 45 },
    },
  },
  {
    label: 'Leche entera',
    expected: 80, tier: 'Excelente',
    why: 'No matchea ningún ancla nombrada (no es yogur ni queso ni manteca), así que va por la cuenta: 75 sin restas + 5 por no tener marcadores.',
    product: {
      product_name: 'Leche entera', categories: 'Lácteos',
      ingredients_text: 'leche entera',
      nutriments: { 'sugars_100g': 4.6, 'saturated-fat_100g': 2, 'energy-kcal_100g': 61, 'fat_100g': 3.2 },
    },
  },
  {
    label: 'Atún al natural',
    expected: 89, tier: 'Excelente',
    why: 'Ancla "carne, pescado o pollo fresco" (85-93): atún + agua + sal, nada más.',
    product: {
      product_name: 'Atún al natural', categories: 'Conservas, Pescados',
      ingredients_text: 'atún, agua, sal',
    },
  },
  {
    label: 'Jamón cocido con ascorbato',
    expected: 49, tier: 'Moderado',
    why: 'Curado con nitrito PERO con ascorbato declarado: no anula, techo 49. Es el caso mayoritario en fiambres argentinos.',
    product: {
      product_name: 'Jamón cocido', categories: 'Fiambres',
      ingredients_text: 'carne de cerdo, agua, sal, azúcar, estabilizantes, ascorbato de sodio, nitrito de sodio',
    },
  },
  {
    label: 'Mayonesa',
    expected: 38, tier: 'Moderado',
    why: 'Aceite de girasol en primera posición (−13) más azúcar y conservante. El panel agrega sellos de grasas y calorías.',
    product: {
      product_name: 'Mayonesa',
      ingredients_text: 'aceite de girasol, agua, yema de huevo, vinagre, azúcar, sal, jugo de limón, conservante',
      nutriments: { 'fat_100g': 45, 'saturated-fat_100g': 5, 'energy-kcal_100g': 420, 'sodium_100g': 0.8 },
    },
  },
  {
    label: 'Manteca con sal',
    expected: 84, tier: 'Excelente',
    why: 'Ancla de manteca (80-88). Los sellos de grasas de la Ley 27.642 no aplican: la grasa es inherente al alimento, no un nutriente crítico añadido.',
    product: {
      product_name: 'Manteca', categories: 'Lácteos, Manteca',
      ingredients_text: 'crema de leche pasteurizada, sal',
      nutriments: { 'saturated-fat_100g': 50, 'fat_100g': 82, 'energy-kcal_100g': 740 },
    },
  },
  {
    label: 'Queso cremoso',
    expected: 82, tier: 'Excelente',
    why: 'Ancla de queso simple (78-86) por composición leche + cuajo. El cloruro de calcio es un coadyuvante de elaboración permitido dentro del arquetipo.',
    product: {
      product_name: 'Queso cremoso', categories: 'Lácteos, Quesos',
      ingredients_text: 'leche, sal, cuajo, fermentos lácticos, cloruro de calcio',
      nutriments: { 'saturated-fat_100g': 18, 'fat_100g': 29, 'energy-kcal_100g': 350 },
    },
  },
  {
    label: 'Barrita de cereal',
    expected: 23, tier: 'Malo',
    why: 'La avena primera no salva al producto: jarabe de glucosa y azúcar en posiciones 2 y 3 son −13 cada uno. La miel acá es azúcar añadida (§4.2), no un alimento.',
    product: {
      product_name: 'Barrita de cereal',
      ingredients_text: 'avena, jarabe de glucosa, azúcar, aceite de girasol, miel, saborizante, emulsionante',
    },
  },
  {
    label: 'Papas fritas de paquete',
    expected: 48, tier: 'Moderado',
    why: 'Tres ingredientes reales, pero el segundo es aceite de semilla (−13). Los sellos de calorías, grasas totales y sodio hacen el resto.',
    product: {
      product_name: 'Papas fritas',
      ingredients_text: 'papa, aceite de girasol alto oleico, sal',
      nutriments: { 'fat_100g': 32, 'saturated-fat_100g': 3, 'sodium_100g': 0.6, 'energy-kcal_100g': 530 },
    },
  },
  {
    label: 'Nutella (etiqueta en inglés de OFF)',
    expected: 28, tier: 'Moderado',
    why: 'Azúcar primera (−13) y aceite de palma segundo (−7), un marcador de ultraprocesado y cuatro sellos de la Ley 27.642. Se muestra todo en español aunque la etiqueta venga en inglés.',
    product: {
      ingredients_text: 'sugar, palm oil, hazelnuts, cocoa, skim milk, reduced minerals whey, lecithin as emulsifier, vanilla',
      nutriments: { 'sugars_100g': 44.2, 'saturated-fat_100g': 9.6, 'energy-kcal_100g': 539, 'sodium_100g': 0.04 },
    },
  },
];

describe('regresión sobre productos reales', () => {
  for (const g of GOLDENS) {
    it(`${g.label} → ${g.expected} (${g.tier})`, () => {
      const bd = scoreProduct(g.product);
      expect(bd.score, g.why).toBe(g.expected);
      expect(bd.tier).toBe(g.tier);
      expectStepsReconstructScore(bd, g.label);
    });
  }

  it('todos los goldens devuelven puntaje: ninguno cae en "sin datos"', () => {
    for (const g of GOLDENS) {
      const bd = scoreProduct(g.product);
      expect(bd.scoreAvailable, `${g.label}: ${bd.noScore?.code}`).toBe(true);
    }
  });

  it('la distribución no se apila en una sola banda', () => {
    // §9 pide vigilar esto durante el testeo: "si más del 40% cae en una sola
    // banda, hay que mover los cortes". Con 13 productos no es estadística,
    // pero sí una alarma temprana si un cambio aplana todo.
    const bandas = GOLDENS.map((g) => scoreProduct(g.product).tier);
    const conteo = new Map<string, number>();
    for (const b of bandas) conteo.set(b, (conteo.get(b) ?? 0) + 1);
    expect(conteo.size).toBeGreaterThanOrEqual(3);
  });
});
