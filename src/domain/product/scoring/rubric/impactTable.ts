/* =========================================================
   FITOGENIX - S4 - TABLA DE INGREDIENTES

   "Esta seccion es datos, no reglas. Crece sin agregar complejidad al
   sistema. Migra a la base de datos: el motor consulta, no clasifica."

   Agregar una fila aca no toca ninguna funcion del motor. Ese es el punto:
   cada regla es una oportunidad de fallar, cada fila es un lookup que no
   cuesta nada.
========================================================= */

import type { ImpactEntry } from '../types';

const D = {
  seedOil:
    'Extraído mediante procesos industriales con solventes químicos y altas temperaturas. Rico en omega-6 en proporciones no presentes en la alimentación tradicional humana.',
  unspecifiedOil:
    'Cuando la etiqueta no dice qué grasa es, asumimos la más económica del mercado, que es un aceite de semilla refinado.',
  interesterified:
    'Grasa reestructurada industrialmente para lograr la consistencia sólida que antes daban las grasas parcialmente hidrogenadas. Es el reemplazo que adoptó la industria tras la eliminación de las grasas trans del Código Alimentario Argentino.',
  palm:
    'Grasa de alto rendimiento industrial, refinada a altas temperaturas. Se usa por su costo y su estabilidad al horneado, no por su aporte al alimento.',
  maltodextrin:
    'Almidón hidrolizado hasta obtener cadenas cortas de glucosa. No aporta dulzor, así que no se declara como azúcar, pero su índice glucémico es superior al de la sacarosa.',
  juiceConcentrate:
    'Permite declarar "sin azúcar agregada" aportando la misma carga de azúcares libres que el azúcar de mesa, sin la fibra ni la matriz de la fruta.',
  traditionalSugar:
    'Un frasco de miel es un alimento. La misma miel dentro de una barrita es azúcar añadida, y cumple la misma función que cumpliría el azúcar refinada. Fitogenix evalúa la función del ingrediente en la formulación, no su prestigio.',
  animalProtein:
    'Proteína láctea o de huevo separada por filtración: ingrediente de fabricación industrial, pero de origen animal y con el perfil de aminoácidos más completo y biodisponible. Si un producto va a incorporar proteína añadida, la de origen animal es preferible a la vegetal.',
  collagen:
    'El colágeno es una proteína animal incompleta: carece de triptófano. No sustituye a una proteína completa.',
  caseinate:
    'Los caseinatos son caseína neutralizada químicamente con álcalis. A diferencia de la caseína micelar, acá hubo modificación química, no solo separación física.',
  sunflowerLecithin:
    'Obtenida típicamente por prensado mecánico, sin el hexano habitual en la de soja. Misma función, extracción menos agresiva.',
  alkalizedCocoa:
    'Cacao tratado con solución alcalina para suavizar acidez y oscurecer color. El proceso reduce buena parte de los flavonoides que hacen valioso al cacao.',
  naturalSweetener:
    'De origen vegetal o fermentativo, preferible a los sintéticos por su origen, aunque sigue siendo un ingrediente purificado. En góndola suele venir mezclada con maltodextrina, eritritol o dextrosa: si la etiqueta declara esos vehículos, se penalizan por separado.',
  fortification:
    'Fortificación exigida por el Código Alimentario Argentino. No penalizamos un ingrediente que el fabricante está obligado por ley a agregar.',
};

export const IMPACT_TABLE: readonly ImpactEntry[] = [
  /* ── §4.1 Grasas y aceites ────────────────────────────────── */
  {
    id: 'aceite-semilla',
    impact: 'alto',
    desc: D.seedOil,
    aliases: [
      'aceite de girasol', 'aceite de girasol alto oleico', 'aceite de soja',
      'aceite de maiz', 'aceite de canola', 'aceite de colza', 'aceite de cartamo',
      'aceite de algodon', 'aceite de semilla de algodon', 'aceite de semillas',
      'aceite de nabina',
      'sunflower oil', 'high oleic sunflower oil', 'soybean oil', 'soy oil',
      'corn oil', 'canola oil', 'rapeseed oil', 'safflower oil', 'cottonseed oil',
    ],
  },
  {
    id: 'aceite-sin-especificar',
    impact: 'alto',
    desc: D.unspecifiedOil,
    aliases: [
      'aceite vegetal', 'aceites vegetales', 'grasa vegetal', 'grasas vegetales',
      'aceite comestible', 'materia grasa vegetal', 'mezcla de aceites vegetales',
      'vegetable oil', 'vegetable oils', 'vegetable fat',
    ],
  },
  {
    id: 'grasa-interesterificada',
    impact: 'alto',
    marker: true,
    desc: D.interesterified,
    aliases: [
      'grasa interesterificada', 'aceite interesterificado',
      'grasa modificada enzimaticamente', 'grasa vegetal modificada',
      'grasa vegetal interesterificada', 'shortening', 'grasa de panificacion',
      'interesterified fat', 'interesterified oil',
    ],
  },
  {
    id: 'palma',
    impact: 'medio',
    desc: D.palm,
    aliases: [
      'aceite de palma', 'grasa de palma', 'oleina de palma', 'estearina de palma',
      'aceite de palmiste', 'palmiste', 'manteca vegetal', 'grasa de coco y palma',
      'palm oil', 'palm fat', 'palm kernel oil', 'palm olein', 'palm stearin',
    ],
  },
  {
    id: 'coco-refinado',
    impact: 'medio',
    aliases: [
      'aceite de coco refinado', 'aceite de coco hidrogenado', 'grasa de coco refinada',
      'refined coconut oil',
    ],
  },
  {
    id: 'aceites-medios',
    impact: 'medio',
    aliases: [
      'aceite de arroz', 'aceite de salvado de arroz', 'aceite de uva',
      'aceite de pepita de uva', 'aceite de mani refinado', 'aceite de sesamo refinado',
      'aceite de mani', 'aceite de sesamo',
      'rice bran oil', 'grapeseed oil', 'peanut oil', 'sesame oil',
    ],
  },
  {
    id: 'oliva-refinado',
    impact: 'medio',
    aliases: [
      'aceite de oliva refinado', 'aceite de oliva suave', 'aceite de oliva ligero',
      'mezcla de aceite de oliva y girasol', 'aceite de oliva y girasol',
      'aceite de orujo de oliva', 'refined olive oil', 'light olive oil',
    ],
  },
  {
    id: 'grasa-animal',
    impact: 'bajo',
    aliases: [
      'grasa bovina', 'grasa vacuna', 'grasa de res', 'sebo', 'sebo vacuno',
      'grasa de cerdo', 'manteca de cerdo', 'grasa de pella', 'grasa de pato',
      'beef tallow', 'lard', 'tallow',
    ],
  },
  {
    id: 'aceites-virgenes-menores',
    impact: 'bajo',
    aliases: [
      'aceite de sesamo virgen', 'aceite de mani prensado en frio',
      'aceite de palta', 'aceite de aguacate', 'avocado oil',
    ],
  },
  {
    id: 'grasas-sin-penalizacion',
    impact: 'none',
    aliases: [
      'aceite de oliva extra virgen', 'aceite de oliva virgen extra',
      'aceite de oliva virgen', 'aceite de oliva', 'aceite de coco virgen',
      'aceite de coco extra virgen', 'aceite de coco', 'ghee', 'manteca clarificada',
      'manteca', 'mantequilla', 'crema de leche', 'crema', 'nata',
      'extra virgin olive oil', 'olive oil', 'virgin coconut oil', 'coconut oil',
      'butter', 'clarified butter', 'cream',
    ],
  },

  /* ── §4.2 Azúcares añadidos ───────────────────────────────── */
  {
    id: 'azucar',
    impact: 'alto',
    aliases: [
      'azucar', 'azucar refinada', 'azucar blanca', 'azucar blanco', 'azucar rubia',
      'azucar organica', 'azucar impalpable', 'azucar mascabo', 'azucar moreno',
      'azucar de cana', 'azucar invertido', 'jarabe invertido',
      'sacarosa', 'dextrosa', 'glucosa', 'maltosa', 'fructosa',
      'sugar', 'cane sugar', 'brown sugar', 'invert sugar', 'sucrose', 'dextrose',
      'glucose', 'maltose', 'fructose',
    ],
  },
  {
    id: 'jarabes',
    impact: 'alto',
    aliases: [
      'jarabe de glucosa', 'jarabe de fructosa', 'jarabe de glucosa y fructosa',
      'jarabe de maiz', 'jarabe de maiz de alta fructosa', 'jarabe de maiz alto en fructosa',
      'jarabe de arroz', 'jarabe de tapioca', 'jarabe de malta', 'extracto de malta',
      'isoglucosa', 'solidos de jarabe de maiz', 'glucosa de maiz',
      'corn syrup', 'high fructose corn syrup', 'glucose syrup', 'fructose syrup',
      'rice syrup', 'malt extract', 'glucose fructose syrup',
    ],
  },
  {
    id: 'maltodextrina',
    impact: 'alto',
    desc: D.maltodextrin,
    aliases: ['maltodextrina', 'maltodextrin', 'dextrina', 'dextrin'],
  },
  {
    id: 'concentrado-jugo',
    impact: 'alto',
    desc: D.juiceConcentrate,
    aliases: [
      'concentrado de jugo', 'jugo concentrado', 'puree concentrado de jugo',
      'pure concentrado de fruta', 'concentrado de fruta', 'jugo de fruta concentrado',
      'jugo de cana evaporado', 'solidos de jugo de cana',
      'fruit juice concentrate', 'juice concentrate', 'evaporated cane juice',
    ],
  },
  {
    id: 'azucar-datil',
    impact: 'alto',
    aliases: ['azucar de datil', 'polvo de datil', 'pasta de datil', 'date sugar'],
  },
  {
    // §4.2 doble tratamiento: ancla si es el producto, Alto si es ingrediente.
    id: 'azucar-tradicional',
    impact: 'alto',
    traditionalSugar: true,
    desc: D.traditionalSugar,
    aliases: [
      'miel', 'miel de cana', 'miel de abejas', 'azucar de abejas', 'panela',
      'chancaca', 'azucar de coco', 'melaza', 'miel de melaza',
      'jarabe de agave', 'sirope de agave', 'jarabe de arce', 'dulce de leche',
      'honey', 'molasses', 'agave syrup', 'maple syrup', 'coconut sugar',
    ],
  },

  /* ── §4.3 Harinas y almidones ─────────────────────────────── */
  {
    id: 'harina-refinada',
    impact: 'alto',
    aliases: [
      'harina de trigo 0000', 'harina de trigo 000', 'harina de trigo 00',
      'harina de trigo', 'harina de trigo enriquecida', 'harina refinada',
      'harina blanca', 'harina 0000', 'harina 000', 'semola refinada',
      'harina de maiz refinada', 'harina de maiz', 'harina de arroz refinada',
      'wheat flour', 'enriched flour', 'refined flour', 'white flour',
      'corn flour', 'refined semolina',
    ],
  },
  {
    id: 'almidon-modificado',
    impact: 'medio',
    marker: true,
    aliases: [
      'almidon modificado', 'fecula modificada', 'almidon de maiz modificado',
      'almidon modificado de maiz', 'modified starch', 'modified corn starch',
      'e1400', 'e1401', 'e1402', 'e1404', 'e1410', 'e1412', 'e1414', 'e1420',
      'e1422', 'e1440', 'e1442', 'e1450', 'e1451',
    ],
  },
  {
    id: 'almidon-simple',
    impact: 'bajo',
    aliases: [
      'almidon', 'fecula', 'almidon de maiz', 'fecula de maiz', 'maicena', 'fecula de mandioca',
      'almidon de mandioca', 'fecula de papa', 'almidon de papa', 'tapioca',
      'corn starch', 'cornstarch', 'potato starch', 'cassava starch',
    ],
  },
  {
    id: 'harinas-integrales',
    impact: 'none',
    aliases: [
      'harina integral', 'harina de trigo integral', 'harina integral de trigo',
      'harina de centeno integral', 'harina de centeno', 'harina de avena',
      'harina de almendras', 'harina de almendra', 'harina de garbanzo',
      'harina de coco', 'harina de maiz integral', 'harina de arroz integral',
      'semola integral', 'avena integral', 'avena arrollada', 'avena',
      'whole wheat flour', 'wholemeal flour', 'almond flour', 'oat flour', 'oats',
    ],
  },

  /* ── §4.4 Proteínas ───────────────────────────────────────── */
  {
    id: 'proteina-lactea-en-polvo',
    impact: 'bajo',
    aliases: [
      'leche en polvo', 'leche entera en polvo', 'leche descremada en polvo',
      'suero de leche en polvo', 'suero lacteo en polvo', 'solidos lacteos',
      'clara de huevo deshidratada', 'huevo en polvo', 'albumina', 'albumen',
      'milk powder', 'whey powder', 'skim milk powder', 'egg white powder',
    ],
  },
  {
    id: 'proteina-animal-aislada',
    impact: 'bajo',
    marker: true,
    isolatedProtein: true,
    desc: D.animalProtein,
    aliases: [
      'proteina de suero aislada', 'aislado de proteina de suero', 'aislado de suero',
      'proteina de suero concentrada', 'concentrado de proteina de suero',
      'concentrado de proteina de leche', 'proteina de leche', 'proteina lactea',
      'caseina micelar', 'caseina', 'proteina de huevo',
      'whey isolate', 'whey protein isolate', 'whey protein concentrate',
      'whey protein', 'milk protein concentrate', 'micellar casein', 'egg protein',
    ],
  },
  {
    id: 'proteina-vegetal-concentrada',
    impact: 'medio',
    marker: true,
    isolatedProtein: true,
    aliases: [
      'concentrado proteico de soja', 'concentrado de proteina de soja',
      'concentrado proteico de arveja', 'concentrado de proteina de arveja',
      'proteina de arroz', 'proteina de canamo', 'proteina de girasol',
      'soy protein concentrate', 'pea protein concentrate', 'rice protein',
      'hemp protein',
    ],
  },
  {
    id: 'colageno',
    impact: 'medio',
    marker: true,
    isolatedProtein: true,
    desc: D.collagen,
    aliases: [
      'colageno hidrolizado', 'peptidos de colageno', 'colageno',
      'hydrolyzed collagen', 'collagen peptides', 'collagen',
    ],
  },
  {
    id: 'proteina-vegetal-aislada',
    impact: 'alto',
    marker: true,
    isolatedProtein: true,
    aliases: [
      'proteina de soja aislada', 'aislado de proteina de soja', 'aislado de soja',
      'proteina de guisante aislada', 'proteina de arveja aislada',
      'aislado de arveja', 'aislado de proteina de arveja',
      'proteina vegetal texturizada', 'proteina de soja texturizada',
      'proteina vegetal', 'proteina aislada',
      'soy protein isolate', 'pea protein isolate', 'textured vegetable protein',
      'isolated soy protein',
    ],
  },
  {
    id: 'proteina-hidrolizada',
    impact: 'alto',
    marker: true,
    isolatedProtein: true,
    aliases: [
      'proteina hidrolizada', 'proteina de soja hidrolizada',
      'proteina de suero hidrolizada', 'hidrolizado de proteina',
      'proteina vegetal hidrolizada', 'hydrolyzed protein',
      'hydrolyzed vegetable protein', 'hydrolyzed whey protein',
    ],
  },
  {
    id: 'caseinatos',
    impact: 'alto',
    marker: true,
    isolatedProtein: true,
    desc: D.caseinate,
    aliases: [
      'caseinato de sodio', 'caseinato de calcio', 'caseinato de potasio',
      'caseinato', 'sodium caseinate', 'calcium caseinate', 'caseinate',
    ],
  },
  {
    id: 'proteina-alimento-entero',
    impact: 'none',
    aliases: [
      'carne', 'carne vacuna', 'carne de cerdo', 'carne de pollo', 'pollo',
      'pechuga de pollo', 'pavo', 'pescado', 'merluza', 'atun', 'salmon',
      'huevo', 'huevos', 'yema', 'clara de huevo', 'leche', 'leche entera',
      'leche descremada', 'yogur', 'queso', 'lenteja', 'lentejas', 'garbanzo',
      'garbanzos', 'poroto', 'porotos', 'arveja', 'arvejas', 'soja', 'frijol',
      'beef', 'chicken', 'fish', 'egg', 'eggs', 'milk', 'whole milk', 'cheese',
      'yogurt', 'lentils', 'chickpeas', 'beans',
    ],
  },

  /* ── §4.5 Aditivos ────────────────────────────────────────── */
  {
    id: 'saborizante-artificial',
    impact: 'alto',
    marker: true,
    aliases: [
      'saborizante artificial', 'saborizantes artificiales', 'aroma artificial',
      'aromas artificiales', 'sabor artificial', 'saborizante identico al natural',
      'aroma identico al natural', 'identico al natural',
      'artificial flavor', 'artificial flavour', 'artificial flavoring',
    ],
  },
  {
    id: 'colorante-artificial',
    impact: 'alto',
    marker: true,
    aliases: [
      'tartrazina', 'e102', 'amarillo ocaso', 'amarillo crepusculo', 'e110',
      'carmoisina', 'azorrubina', 'e122', 'amaranto', 'e123', 'rojo allura',
      'rojo 40', 'e129', 'azul brillante', 'e133', 'verde rapido', 'e143',
      'indigotina', 'e132', 'negro brillante', 'e151', 'rojo ponceau', 'e124',
      'tartrazine', 'sunset yellow', 'allura red', 'brilliant blue',
      'colorante artificial', 'colorantes artificiales', 'artificial color',
    ],
  },
  {
    // §5 — Sustancias que anulan. Están acá además de en ANNUL_GATES para que
    // el motor las RECONOZCA: si cayeran en "no identificado", un producto con
    // dos de ellas se iría a "sin datos suficientes" por §1.2 y nunca llegaría
    // a la anulación que le corresponde.
    id: 'sustancia-anulante',
    impact: 'alto',
    marker: true,
    aliases: [
      'dioxido de titanio', 'titanium dioxide', 'e171',
      'eritrosina', 'erythrosine', 'rojo no 3', 'e127',
      'bromato de potasio', 'potassium bromate', 'e924',
      'aceite parcialmente hidrogenado', 'grasa parcialmente hidrogenada',
      'aceite vegetal hidrogenado', 'grasa vegetal hidrogenada',
      'aceite hidrogenado', 'grasa hidrogenada', 'grasa vegetal endurecida',
      'manteca vegetal hidrogenada', 'margarina', 'margarine',
      'partially hydrogenated oil', 'hydrogenated oil', 'hydrogenated fat',
    ],
  },
  {
    id: 'potenciador-sabor',
    impact: 'medio',
    marker: true,
    aliases: [
      'glutamato monosodico', 'glutamato de sodio', 'glutamato', 'e621',
      'inosinato disodico', 'inosinato', 'e631', 'guanilato disodico',
      'guanilato', 'e627', 'ribonucleotidos', 'e635',
      'potenciador de sabor', 'potenciadores de sabor', 'realzador de sabor',
      'monosodium glutamate', 'msg', 'flavor enhancer',
    ],
  },
  {
    id: 'emulsionante',
    impact: 'medio',
    marker: true,
    aliases: [
      'lecitina de soja', 'lecitina de soya', 'e322',
      'mono y digliceridos', 'monogliceridos', 'digliceridos',
      'mono y digliceridos de acidos grasos', 'esteres de mono y digliceridos',
      'e471', 'e472', 'e472a', 'e472b', 'e472c', 'e472e',
      'carragenina', 'carragenano', 'carrageenan', 'e407',
      'goma xantana', 'xanthan gum', 'e415',
      'goma guar', 'guar gum', 'e412',
      'goma arabiga', 'gum arabic', 'e414',
      'carboximetilcelulosa', 'celulosa microcristalina', 'e466', 'e460',
      'polisorbato', 'e433', 'e435', 'estearoil lactilato', 'e481', 'e482',
      'emulsionante', 'emulsionantes', 'emulsificante', 'estabilizante',
      'espesante', 'emulsifier', 'stabilizer', 'thickener',
    ],
  },
  {
    id: 'conservante',
    impact: 'medio',
    aliases: [
      'sorbato de potasio', 'e202', 'acido sorbico', 'e200',
      'benzoato de sodio', 'e211', 'acido benzoico', 'e210',
      'propionato de calcio', 'e282', 'propionato de sodio', 'e281',
      'nisina', 'e234', 'natamicina', 'e235',
      'conservante', 'conservantes', 'conservador',
      'potassium sorbate', 'sodium benzoate', 'calcium propionate', 'preservative',
    ],
  },
  {
    id: 'antioxidante-sintetico',
    impact: 'medio',
    marker: true,
    aliases: [
      'bha', 'e320', 'bht', 'e321', 'butilhidroxianisol', 'butilhidroxitolueno',
      'galato de propilo', 'e310', 'tbhq', 'e319',
    ],
  },
  {
    // Coadyuvantes de elaboración: cumplen una función técnica en la
    // fabricación (cuajar, leudar, regular pH) y no están para modificar el
    // sabor ni la vida útil percibida. Impacto bajo, no marcador.
    id: 'coadyuvantes',
    impact: 'bajo',
    aliases: [
      'cloruro de calcio', 'e509', 'cloruro de magnesio', 'e511',
      'bicarbonato de sodio', 'e500', 'bicarbonato de amonio', 'e503',
      'carbonato de calcio', 'e170', 'polvo de hornear', 'leudante quimico',
      'pirofosfato', 'e450', 'fosfato de sodio', 'e339',
      'enzimas', 'enzima', 'amilasa', 'proteasa', 'transglutaminasa',
      'calcium chloride', 'baking soda', 'enzymes',
    ],
  },
  {
    id: 'sulfitos',
    impact: 'medio',
    aliases: [
      'dioxido de azufre', 'anhidrido sulfuroso', 'metabisulfito de sodio',
      'metabisulfito de potasio', 'metabisulfito', 'sulfito de sodio', 'sulfitos',
      'e220', 'e221', 'e222', 'e223', 'e224', 'e225', 'e226', 'e227', 'e228',
      'sulphur dioxide', 'sodium metabisulphite', 'sulfites',
    ],
  },
  {
    id: 'lecitina-sin-especificar',
    impact: 'medio',
    aliases: ['lecitina', 'lecithin'],
  },
  {
    id: 'lecitina-girasol',
    impact: 'bajo',
    desc: D.sunflowerLecithin,
    aliases: ['lecitina de girasol', 'sunflower lecithin'],
  },
  {
    id: 'saborizante-natural',
    impact: 'bajo',
    marker: true,
    aliases: [
      'saborizante natural', 'saborizantes naturales', 'aroma natural',
      'aromas naturales', 'saborizante', 'saborizantes', 'aroma', 'aromas',
      'aromatizante', 'natural flavor', 'natural flavour', 'flavoring', 'flavouring',
    ],
  },
  {
    id: 'cacao-alcalinizado',
    impact: 'bajo',
    desc: D.alkalizedCocoa,
    aliases: [
      'cacao alcalinizado', 'cacao procesado con alcali', 'cacao tipo holandes',
      'cacao alcalino', 'alkalized cocoa', 'dutch process cocoa',
    ],
  },
  {
    id: 'vitaminas-minerales',
    impact: 'bajo',
    aliases: [
      'vitamina a', 'vitamina b1', 'vitamina b2', 'vitamina b6', 'vitamina b12',
      'vitamina c', 'vitamina d', 'vitamina d3', 'vitamina e', 'vitamina k',
      'acido ascorbico', 'ascorbato de sodio', 'niacinamida', 'piridoxina',
      'cianocobalamina', 'sulfato de zinc', 'oxido de zinc', 'gluconato de zinc',
      'carbonato de calcio', 'fosfato de calcio', 'sulfato de magnesio',
      'vitaminas', 'minerales anadidos', 'premezcla vitaminica',
    ],
  },
  {
    // §4.5 excepción — Ley 25.630. No penalizar lo que la ley obliga a agregar.
    id: 'fortificacion-obligatoria',
    impact: 'none',
    mandatoryFortification: true,
    desc: D.fortification,
    aliases: [
      'sal yodada', 'yoduro de potasio', 'yodato de potasio',
      'sulfato ferroso', 'hierro', 'tiamina', 'riboflavina', 'niacina',
      'acido folico', 'folato', 'ley 25630', 'ley 25.630',
    ],
  },
  {
    // §5.2 — Agentes de curado vegetales. No están en la tabla de §4 porque
    // el documento los trata en las anulaciones, pero fuera de un cárnico
    // siguen siendo nitrato añadido con función de conservante.
    id: 'agente-curado-vegetal',
    impact: 'alto',
    desc: 'Aporta nitrato que se convierte en nitrito durante el curado. Su función es idéntica a la del nitrito de sodio: conservar y dar color. La diferencia es de etiqueta, no de química.',
    aliases: [
      'polvo de apio', 'jugo de apio', 'cultivo de apio', 'extracto de apio',
      'apio en polvo', 'extracto de acerola', 'polvo de acerola',
      'extracto de espinaca', 'jugo de remolacha en polvo', 'remolacha en polvo',
      'celery powder', 'celery juice powder', 'cultured celery',
    ],
  },
  {
    id: 'nitritos-declarados',
    impact: 'alto',
    aliases: [
      'nitrito de sodio', 'nitrato de sodio', 'nitrito de potasio',
      'nitrato de potasio', 'sal de cura', 'sal nitritada', 'nitrito', 'nitrato',
      'e249', 'e250', 'e251', 'e252',
      'sodium nitrite', 'sodium nitrate', 'potassium nitrite', 'potassium nitrate',
    ],
  },
  {
    id: 'condimentos-sin-penalizacion',
    impact: 'none',
    aliases: [
      'sal', 'sal marina', 'sal fina', 'sal gruesa', 'sal de mar', 'salt', 'sea salt',
      'agua', 'water', 'agua mineral', 'agua de manantial', 'agua purificada',
      'vinagre', 'vinagre de manzana', 'vinagre de vino', 'vinagre de alcohol',
      'vinegar', 'jugo de limon', 'lemon juice', 'acido citrico', 'citric acid',
      'pimienta', 'pimenton', 'comino', 'oregano', 'albahaca', 'romero', 'tomillo',
      'laurel', 'perejil', 'cilantro', 'curcuma', 'jengibre', 'canela', 'clavo',
      'nuez moscada', 'ajo', 'cebolla', 'aji', 'chile', 'pepper', 'cinnamon',
      'garlic', 'onion', 'oregano', 'basil', 'rosemary', 'thyme', 'cumin',
      'especias', 'hierbas', 'condimento',
    ],
  },
  {
    id: 'fermentos',
    impact: 'none',
    aliases: [
      'fermentos lacticos', 'fermentos', 'cultivos lacticos', 'cultivos activos',
      'cultivos iniciadores', 'masa madre', 'levadura', 'cuajo', 'cuajo natural',
      'lactic cultures', 'live cultures', 'sourdough', 'yeast', 'rennet',
    ],
  },
  {
    id: 'cacao-puro',
    impact: 'none',
    aliases: [
      'cacao', 'cacao puro', 'cacao en polvo', 'pasta de cacao', 'licor de cacao',
      'nibs de cacao', 'manteca de cacao', 'cocoa', 'cocoa mass', 'cocoa butter',
      'cacao amargo',
    ],
  },
  {
    id: 'extractos-nombrados',
    impact: 'none',
    aliases: [
      'extracto de vainilla', 'vainilla', 'vainilla en vaina', 'vanilla extract',
      'extracto de cafe', 'extracto de te', 'extracto de malta de cebada',
      'extracto de romero', 'yerba mate', 'cafe', 'te verde', 'te negro',
    ],
  },
  {
    id: 'tocoferoles',
    impact: 'none',
    aliases: [
      'tocoferoles', 'tocoferol', 'alfa tocoferol', 'extracto rico en tocoferoles',
      'e306', 'e307', 'e308', 'e309', 'tocopherols',
    ],
  },
  {
    id: 'frutas-verduras',
    impact: 'none',
    aliases: [
      'manzana', 'banana', 'naranja', 'pera', 'frutilla', 'durazno', 'anana',
      'uva', 'ciruela', 'mandarina', 'limon', 'palta', 'aguacate', 'tomate',
      'lechuga', 'espinaca', 'zanahoria', 'brocoli', 'zapallo', 'calabaza',
      'papa', 'batata', 'pepino', 'morron', 'choclo', 'arandano', 'frambuesa',
      'mora', 'cereza', 'kiwi', 'mango', 'coco', 'coco rallado',
      'apio', 'remolacha', 'rucula', 'acelga', 'repollo', 'coliflor',
      'berenjena', 'zapallito', 'puerro', 'chaucha', 'esparrago', 'alcaucil',
      'acerola', 'maracuya', 'pomelo', 'higo', 'damasco', 'membrillo',
      'pulpa de fruta', 'pulpa', 'pure de fruta', 'trozos de fruta',
      'apple', 'banana', 'orange', 'strawberry', 'tomato', 'spinach', 'carrot',
      'hazelnut', 'hazelnuts', 'avellana', 'avellanas', 'almendra', 'almendras',
      'nuez', 'nueces', 'castana', 'castanas', 'mani', 'pistacho', 'semillas',
      'semillas de girasol', 'semillas de chia', 'chia', 'lino', 'sesamo',
      'quinoa', 'arroz integral', 'arroz', 'arroz blanco', 'trigo', 'centeno', 'cebada',
      'chucrut', 'kimchi', 'pickles', 'encurtidos', 'aceitunas', 'aceituna',
      'salmuera', 'kefir', 'palmitos', 'champinones', 'hongos', 'esparragos',
      'pasas de uva', 'pasas', 'datiles', 'datil', 'orejones', 'higos secos',
      'ciruela desecada', 'fruta desecada', 'fruta deshidratada', 'coco deshidratado',
      'manzanilla', 'boldo', 'tilo', 'menta', 'yerba', 'malta de cebada', 'lupulo',
      'semola', 'semola de trigo', 'semola de trigo candeal', 'semolin',
      'harina', 'mijo', 'amaranto en grano', 'salvado', 'salvado de avena',
      'levadura', 'agua carbonatada', 'agua gasificada', 'cafeina',
      'yema de huevo', 'clara', 'suero de leche', 'suero lacteo', 'lactosa',
      'papa', 'papas', 'batata', 'mandioca', 'polenta',
    ],
  },

  /* ── §4.6 Edulcorantes ────────────────────────────────────── */
  {
    id: 'edulcorante-sintetico',
    impact: 'medio',
    marker: true,
    aliases: [
      'aspartamo', 'e951', 'acesulfame potasico', 'acesulfame k', 'acesulfame',
      'e950', 'sucralosa', 'e955', 'sacarina', 'e954', 'ciclamato', 'e952',
      'neotamo', 'e961', 'advantamo', 'e969',
      'aspartame', 'sucralose', 'saccharin', 'cyclamate',
    ],
  },
  {
    id: 'polioles',
    impact: 'medio',
    marker: true,
    aliases: [
      'maltitol', 'e965', 'sorbitol', 'e420', 'xilitol', 'e967', 'isomalt',
      'e953', 'lactitol', 'e966', 'manitol', 'e421', 'eritritol', 'e968',
      'jarabe de maltitol', 'polioles', 'polialcoholes',
      'maltitol syrup', 'sorbitol', 'xylitol', 'erythritol',
    ],
  },
  {
    // §4.6 — "No equiparar la stevia al aspartamo."
    id: 'edulcorante-natural',
    impact: 'bajo',
    desc: D.naturalSweetener,
    aliases: [
      'glucosidos de esteviol', 'esteviol', 'stevia', 'estevia', 'e960',
      'monk fruit', 'fruto del monje', 'luo han guo', 'taumatina', 'e957',
      'steviol glycosides',
    ],
  },
];

/* Eritritol aparece dos veces a propósito: §4.6 lo lista entre los polioles y
 * §2 Paso 3 lo excluye explícitamente de los marcadores de ultraprocesado
 * junto con la stevia y el monk fruit. Se resuelve acá, no en el motor. */
export const NON_MARKER_OVERRIDES: readonly string[] = ['eritritol', 'e968', 'erythritol', 'stevia', 'estevia', 'monk fruit'];

/**
 * §3.3 v2.0 heredado — Patrón de aditivo industrial. Un ingrediente que
 * matchea esto pero no está en IMPACT_TABLE se penaliza como impacto MEDIO:
 * la ausencia de clasificación específica no equivale a sin riesgo, y un
 * número E declarado ya prueba que es un aditivo.
 */
export const ADDITIVE_PATTERN =
  /\be\s?\d{3,4}[a-d]?\b|\bins\s?\d{3,4}\b|emulsionante|emulsificante|estabilizante|estabilizador|conservante|conservador|colorante|potenciador de sabor|antiaglomerante|antihumectante|antioxidante|humectante|espesante|acidulante|regulador de acidez|gasificante|leudante|antiespumante|emulsifier|preservative|stabili[sz]er|colou?ring|thickener|anticaking|flavou?r enhancer|humectant|raising agent/i;

/**
 * Gondola de bebidas: una "manzana" aca es jugo de manzana, no una manzana.
 * Tambien decide el umbral de calorias de los octogonos (liquido vs solido).
 */
export const DRINK_CATEGORY_PATTERN =
  /bebida|gaseosa|refresco|jugo|zumo|juice|drink|beverage|agua saborizada/i;

/**
 * Regla de cierre de la seccion 4.2: cualquier ingrediente cuya funcion sea
 * aportar azucares libres se penaliza como azucar anadida. El jugo pierde la
 * fibra y la matriz de la fruta, asi que entra aca aunque sea 100% exprimido.
 */
export const FRUIT_JUICE_PATTERN =
  /\bjugos?\b|\bzumos?\b|\bjuice\b|\bn[eé]ctar(?:es)?\b|\bexprimido\b/i;
