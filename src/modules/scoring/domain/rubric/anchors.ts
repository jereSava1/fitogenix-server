/* =========================================================
   FITOGENIX - S3 - ANCLAS

   Productos que SON un ingrediente. Si el listado entero cabe en una fila,
   esa fila es el puntaje y el pipeline se saltea al Paso 5.

   "Un ancla se aplica solo si la lista completa esta contenida en la fila.
   Un ingrediente extra invalida el ancla. Que el primer ingrediente sea avena
   no convierte al producto en avena." 
========================================================= */

import type { Anchor } from '../types';

const SEASONING = ['sal', 'agua', 'salt', 'water'];

/** §3 Positivas. */
export const POSITIVE_ANCHORS: readonly Anchor[] = [
  {
    id: 'agua', label: 'Agua mineral o de manantial',
    min: 95, max: 100, maxIngredients: 2, maxSugars: 0.5,
    required: ['agua mineral', 'agua de manantial', 'agua'],
    allowed: ['minerales', 'sales minerales', 'agua purificada'],
  },
  {
    id: 'fruta-verdura-huevo', label: 'Fruta, verdura o huevo entero',
    min: 92, max: 98, maxIngredients: 3, maxSugars: 20,
    required: [
      'huevo', 'huevos', 'egg', 'banana', 'manzana', 'naranja', 'pera', 'frutilla',
      'durazno', 'anana', 'uva', 'ciruela', 'mandarina', 'limon', 'palta',
      'tomate', 'lechuga', 'espinaca', 'zanahoria', 'brocoli', 'zapallo',
      'calabaza', 'papa', 'batata', 'cebolla', 'ajo', 'pepino', 'morron',
      'choclo', 'arandano', 'frambuesa', 'kiwi', 'mango',
    ],
    allowed: [...SEASONING, 'fruta', 'verdura', 'frutas', 'verduras'],
  },
  {
    id: 'especias', label: 'Especias y hierbas puras',
    min: 88, max: 95, maxIngredients: 4,
    required: [
      'pimienta', 'pimenton', 'comino', 'oregano', 'albahaca', 'romero', 'tomillo',
      'laurel', 'perejil', 'cilantro', 'curcuma', 'jengibre', 'canela', 'clavo',
      'nuez moscada', 'aji', 'especias', 'hierbas',
    ],
    allowed: [...SEASONING, 'condimento', 'especias', 'hierbas'],
  },
  {
    id: 'aove', label: 'Aceite de oliva extra virgen',
    min: 88, max: 95, maxIngredients: 1,
    required: ['aceite de oliva extra virgen', 'aceite de oliva virgen extra', 'extra virgin olive oil'],
    allowed: [],
  },
  {
    id: 'carne-fresca', label: 'Carne, pescado o pollo fresco sin aditivos',
    min: 85, max: 93, maxIngredients: 3, maxSugars: 3,
    categoryPattern: /carne|pollo|pescado|pechuga|meat|chicken|fish/i,
    required: [
      'carne', 'carne vacuna', 'pollo', 'pechuga', 'pechuga de pollo', 'pescado',
      'merluza', 'salmon', 'atun', 'cerdo', 'pavo', 'chicken', 'beef', 'fish',
    ],
    allowed: SEASONING,
  },
  {
    id: 'legumbres', label: 'Legumbres secas',
    min: 85, max: 92, maxIngredients: 3,
    required: ['lenteja', 'lentejas', 'garbanzo', 'garbanzos', 'poroto', 'porotos', 'arveja', 'arvejas', 'soja', 'frijol', 'lentils', 'chickpeas'],
    allowed: SEASONING,
  },
  {
    id: 'fermentados', label: 'Vegetales fermentados sin aditivos',
    min: 85, max: 92, maxIngredients: 5,
    categoryPattern: /chucrut|kimchi|pickle|encurtido|fermentado/i,
    required: ['chucrut', 'kimchi', 'pickles', 'encurtidos', 'repollo fermentado'],
    allowed: [...SEASONING, 'repollo', 'vinagre', 'especias', 'hierbas', 'ajo', 'aji', 'zanahoria', 'cebolla', 'jengibre'],
  },
  {
    id: 'infusiones', label: 'Yerba mate, café, té e infusiones de hoja',
    min: 85, max: 92, maxIngredients: 3,
    categoryPattern: /yerba|mate|caf[eé]|\bt[eé]\b|infusi[oó]n|coffee|\btea\b/i,
    required: ['yerba mate', 'yerba', 'cafe', 'te verde', 'te negro', 'te', 'manzanilla', 'boldo', 'tilo', 'menta', 'coffee', 'tea'],
    allowed: ['palo', 'hierbas', 'hojas', 'tallos'],
  },
  {
    id: 'kefir', label: 'Kefir de leche entera',
    min: 84, max: 90, maxIngredients: 3, maxSugars: 8,
    categoryPattern: /kefir|k[eé]fir/i,
    required: ['kefir'],
    requiredAll: [['leche', 'kefir']],
    allowed: ['leche', 'leche entera', 'fermentos', 'cultivos lacticos', 'cultivos activos'],
  },
  {
    id: 'yogur', label: 'Yogur entero natural',
    min: 82, max: 90, maxIngredients: 3, maxSugars: 8,
    categoryPattern: /yogur|yoghurt|yogurt/i,
    required: ['yogur', 'yoghurt', 'yogurt'],
    requiredAll: [['leche', 'fermentos'], ['leche', 'cultivos lacticos'], ['leche', 'cultivos activos']],
    allowed: ['leche', 'leche entera', 'leche descremada', 'fermentos', 'fermentos lacticos', 'cultivos lacticos', 'cultivos activos'],
  },
  {
    id: 'frutos-secos', label: 'Frutos secos sin sal ni aceites añadidos',
    min: 82, max: 90, maxIngredients: 4,
    required: ['almendra', 'almendras', 'nuez', 'nueces', 'castana', 'castanas', 'avellana', 'avellanas', 'mani', 'pistacho', 'almonds', 'walnuts', 'peanuts'],
    allowed: ['sal', 'salt'],
  },
  {
    id: 'vinagre', label: 'Vinagre de fermentación',
    min: 82, max: 90, maxIngredients: 2,
    required: ['vinagre', 'vinagre de manzana', 'vinagre de vino', 'vinegar'],
    allowed: ['agua', 'water'],
  },
  {
    id: 'manteca', label: 'Manteca',
    min: 80, max: 88, maxIngredients: 3,
    categoryPattern: /manteca|mantequilla|butter/i,
    required: ['manteca', 'mantequilla', 'butter', 'crema de leche', 'crema', 'nata'],
    allowed: [...SEASONING, 'crema de leche', 'crema', 'nata', 'fermentos', 'cultivos lacticos'],
  },
  {
    id: 'aceitunas-sal', label: 'Aceitunas en salmuera · sal marina',
    min: 80, max: 88, maxIngredients: 4,
    required: ['aceitunas', 'aceituna', 'sal marina', 'sal de mar', 'olives', 'sea salt'],
    allowed: [...SEASONING, 'salmuera', 'vinagre', 'especias', 'hierbas', 'oregano', 'aji'],
  },
  {
    id: 'queso-simple', label: 'Queso simple',
    min: 78, max: 86, maxIngredients: 5, maxSugars: 6,
    categoryPattern: /queso|cheese/i,
    required: ['queso', 'cheese'],
    requiredAll: [['leche', 'cuajo'], ['leche', 'fermentos']],
    allowed: [...SEASONING, 'leche', 'leche entera', 'leche descremada', 'fermentos', 'fermentos lacticos', 'cultivos lacticos', 'cuajo', 'cuajo natural', 'rennet', 'cloruro de calcio'],
  },
  {
    id: 'cereal-integral', label: 'Cereales integrales sin procesar · harina integral',
    min: 78, max: 86, maxIngredients: 3,
    required: [
      'avena', 'avena integral', 'avena arrollada', 'arroz integral', 'quinoa',
      'trigo integral', 'harina integral', 'harina de trigo integral',
      'harina integral de trigo', 'centeno', 'cebada', 'mijo', 'amaranto en grano',
      'oats', 'brown rice', 'whole wheat flour',
    ],
    allowed: SEASONING,
  },
  {
    id: 'conserva-natural', label: 'Conservas al natural',
    min: 78, max: 86, maxIngredients: 4, maxSugars: 6,
    categoryPattern: /al natural|en agua|conserva/i,
    required: ['atun', 'caballa', 'sardina', 'arvejas', 'choclo', 'tomate', 'poroto', 'garbanzo', 'lenteja', 'palmitos', 'champinones'],
    allowed: [...SEASONING, 'agua', 'salmuera', 'acido citrico'],
  },
  {
    id: 'miel', label: 'Miel pura',
    min: 78, max: 85, maxIngredients: 1,
    required: ['miel', 'miel pura', 'honey'],
    allowed: [],
  },
  {
    id: 'fruta-desecada', label: 'Frutas desecadas sin azúcar ni sulfitos',
    min: 76, max: 84, maxIngredients: 2,
    categoryPattern: /desecad|deshidratad|pasas|dried fruit/i,
    required: ['pasas de uva', 'pasas', 'ciruela desecada', 'orejones', 'damasco desecado', 'higos secos', 'datiles', 'datil', 'fruta desecada', 'fruta deshidratada'],
    allowed: [],
  },
  {
    id: 'masa-madre', label: 'Pan de masa madre',
    min: 72, max: 82, maxIngredients: 5,
    categoryPattern: /masa madre|sourdough/i,
    required: ['masa madre', 'sourdough'],
    allowed: [...SEASONING, 'harina', 'harina integral', 'harina de trigo integral', 'harina de centeno', 'harina de trigo', 'masa madre'],
  },
  {
    id: 'pasta-seca', label: 'Pasta seca',
    min: 70, max: 80, maxIngredients: 4,
    categoryPattern: /pasta|fideos|spaghetti|macarr/i,
    required: ['semola', 'semola de trigo', 'semolin', 'harina de trigo', 'semola de trigo candeal'],
    allowed: [...SEASONING, 'huevo', 'huevos', 'semola', 'semola de trigo', 'harina de trigo'],
  },
];

/** §3 Negativas — productos que SON el ingrediente penalizado. */
export const NEGATIVE_ANCHORS: readonly Anchor[] = [
  {
    id: 'arroz-blanco', label: 'Arroz blanco pulido',
    min: 62, max: 72, maxIngredients: 2,
    categoryPattern: /arroz/i,
    required: ['arroz blanco', 'arroz pulido', 'arroz'],
    allowed: SEASONING,
  },
  {
    id: 'oliva-refinado', label: 'Aceite de oliva refinado o "suave"',
    min: 52, max: 62, maxIngredients: 2,
    required: ['aceite de oliva refinado', 'aceite de oliva suave', 'aceite de oliva ligero', 'aceite de orujo de oliva'],
    allowed: [],
  },
  {
    id: 'harina-000', label: 'Harina de trigo 000/0000',
    min: 30, max: 40, maxIngredients: 2,
    required: ['harina de trigo 000', 'harina de trigo 0000', 'harina de trigo', 'harina 000', 'harina 0000', 'harina refinada'],
    allowed: ['hierro', 'tiamina', 'riboflavina', 'niacina', 'acido folico', 'sulfato ferroso', 'ley 25630'],
  },
  {
    id: 'palma', label: 'Aceite o grasa de palma',
    min: 28, max: 38, maxIngredients: 2,
    required: ['aceite de palma', 'grasa de palma', 'oleina de palma', 'estearina de palma', 'palm oil'],
    allowed: [],
  },
  {
    id: 'almidon-modificado', label: 'Almidón modificado',
    min: 22, max: 32, maxIngredients: 2,
    required: ['almidon modificado', 'fecula modificada', 'modified starch'],
    allowed: [],
  },
  {
    id: 'margarina', label: 'Margarina · bebida edulcorada sin azúcar',
    min: 20, max: 30, maxIngredients: 8,
    categoryPattern: /margarina|margarine/i,
    required: ['margarina', 'margarine'],
    allowed: [],
  },
  {
    id: 'aceite-semilla', label: 'Aceite de semilla refinado',
    min: 18, max: 28, maxIngredients: 2,
    required: [
      'aceite de girasol', 'aceite de soja', 'aceite de maiz', 'aceite de canola',
      'aceite de colza', 'aceite de cartamo', 'aceite de algodon',
      'aceite de girasol alto oleico', 'sunflower oil', 'soybean oil', 'canola oil',
    ],
    allowed: ['antioxidante', 'tocoferoles', 'e306', 'acido citrico'],
  },
  {
    id: 'maltodextrina', label: 'Maltodextrina · aceite vegetal sin especificar',
    min: 15, max: 25, maxIngredients: 2,
    required: ['maltodextrina', 'aceite vegetal', 'aceites vegetales', 'grasa vegetal', 'maltodextrin'],
    allowed: [],
  },
  {
    id: 'azucar', label: 'Azúcar, jarabe de glucosa, dextrosa',
    min: 12, max: 20, maxIngredients: 2,
    required: ['azucar', 'jarabe de glucosa', 'dextrosa', 'glucosa', 'sacarosa', 'sugar'],
    allowed: [],
  },
  {
    id: 'bebida-azucarada', label: 'Bebida azucarada carbonatada',
    min: 8, max: 18, maxIngredients: 10,
    categoryPattern: /gaseosa|refresco|bebida carbonatada|soda|soft drink|cola/i,
    required: ['agua carbonatada', 'agua gasificada'],
    requiredAll: [['agua carbonatada', 'azucar'], ['agua gasificada', 'azucar']],
    allowed: ['agua', 'agua carbonatada', 'agua gasificada', 'azucar', 'jarabe de maiz', 'colorante caramelo', 'e150', 'e150d', 'acido fosforico', 'e338', 'cafeina', 'aroma', 'aromas', 'saborizante', 'acido citrico'],
  },
  {
    id: 'jmaf', label: 'Jarabe de maíz alto en fructosa',
    min: 5, max: 12, maxIngredients: 2,
    required: ['jarabe de maiz de alta fructosa', 'jarabe de maiz alto en fructosa', 'high fructose corn syrup'],
    allowed: [],
  },
];

export const ALL_ANCHORS: readonly Anchor[] = [...POSITIVE_ANCHORS, ...NEGATIVE_ANCHORS];
