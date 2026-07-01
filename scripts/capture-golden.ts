// Captura scores del motor ACTUAL para productos reales representativos.
// Estos valores se congelan como golden de regresión antes del refactor.
import { ftgScoreWithBreakdown, ftgAnalyzeIngredients } from '../src/domain/product/ftgEngine';
import type { ProductInput } from '../src/domain/product/ftgEngine';

const FIXTURES: Record<string, ProductInput> = {
  // NOVA 1 alimento entero — ingredientes verdes en español
  huevos_avena: {
    ingredients_text: 'huevos, avena integral, banana, canela',
    nova_group: 1,
    nutriments: { 'proteins_100g': 13, 'sugars_100g': 5, 'saturated-fat_100g': 3, 'fiber_100g': 9, 'sodium_100g': 0.05 },
  },
  // Ultraprocesado con azúcar y aceite de girasol (español)
  galletita_es: {
    ingredients_text: 'harina de trigo, azúcar, aceite de girasol, jarabe de maíz de alta fructosa, sal',
    nova_group: 4,
    additives_tags: ['en:e322', 'en:e500'],
    nutriments: { 'sugars_100g': 30, 'saturated-fat_100g': 8, 'sodium_100g': 0.4, 'proteins_100g': 6, 'fiber_100g': 2 },
  },
  // Con aspartamo — debe activar gate techo 49
  gaseosa_light: {
    ingredients_text: 'agua carbonatada, aspartamo, ácido fosfórico, cafeína',
    nova_group: 4,
    additives_tags: ['en:e951', 'en:e338'],
    nutriments: { 'sugars_100g': 0, 'sodium_100g': 0.02 },
  },
  // Grasa trans — debe anular (0-24)
  margarina_pho: {
    ingredients_text: 'aceite vegetal parcialmente hidrogenado, agua, sal',
    nova_group: 4,
    nutriments: { 'trans-fat_100g': 2, 'saturated-fat_100g': 20, 'sodium_100g': 0.8 },
  },
  // Nutella real de OFF — ingredientes en INGLÉS (el bug)
  nutella_en: {
    ingredients_text: 'sugar, palm oil, hazelnuts, cocoa, skim milk, reduced minerals whey, lecithin as emulsifier, vanilla',
    nova_group: 4,
    nutriments: { 'sugars_100g': 44.2, 'saturated-fat_100g': 9.6, 'sodium_100g': 0.2, 'proteins_100g': 7.7, 'fiber_100g': 3.8 },
  },
  // Producto sin datos de ingredientes
  sin_datos: {
    ingredients_text: '',
    nutriments: {},
  },
};

for (const [name, product] of Object.entries(FIXTURES)) {
  const bd = ftgScoreWithBreakdown(product);
  const ings = ftgAnalyzeIngredients(product);
  console.log(`\n═══ ${name} ═══`);
  console.log(`score=${bd.score} tier=${bd.tier} gate=${bd.gateTriggered ? 'SÍ' : 'no'}`);
  console.log(`  tox=${bd.components.toxicidad.score} nut=${bd.components.nutricion.score} proc=${bd.components.procesamiento.score} alin=${bd.components.alineacion.score}`);
  console.log(`  ings: ${ings.map((i) => `${i.name}[${i.sev}]`).join(', ')}`);
}
