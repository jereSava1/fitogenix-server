/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Rúbrica de puntuación v1.0 (fitogenix_scoring_engine_v1.md)

   Traducción literal del documento de producto a datos. Vive separado de
   ingredientData.ts a propósito: ese archivo es la base de ingredientes para
   la UI (descripciones, severidad mostrada); ESTE es la rúbrica que decide
   cuánto pesa cada cosa en el puntaje. Cuando el documento cambie, se toca
   este archivo y nada más.

   Cada tabla lleva la sección del documento que la origina, para poder
   auditar el motor contra el spec sin leer la lógica.
═══════════════════════════════════════════════════════════ */

/** §3.2 — Escala de impacto de un ingrediente sobre el puntaje. */
export type Impact = 'alto' | 'medio' | 'bajo' | 'none';

const WORDISH = /[\p{L}\p{N}]/u;
// Sufijos que aceptamos pegados al alias: plurales del español. Sin esto,
// "azúcares" o "aceites vegetales" dejarían de matchear.
const PLURAL_SUFFIXES = ['', 's', 'es'];

/**
 * ¿`phrase` aparece en `haystack` como palabra (o frase) completa?
 *
 * Reemplaza al `includes()` pelado que se usaba antes, que producía falsos
 * negativos peligrosos: el alias "sal" (sin penalización) matcheaba dentro de
 * "salame", "salchicha" y "salsa de soja", así que un embutido puntuaba como
 * sal de mesa. Y "ajo" matcheaba dentro de "trabajo".
 *
 * Ambos extremos tienen que caer en un borde de palabra, con la salvedad del
 * plural: "azúcar" tiene que seguir matcheando "azúcares".
 */
export function matchesPhrase(haystack: string, phrase: string): boolean {
  return indexOfPhrase(haystack, phrase) >= 0;
}

/** Posición donde `phrase` aparece como palabra completa, o -1. Necesaria
 *  además del booleano para poder detectar VARIAS sustancias dentro de un
 *  mismo fragmento sin que se pisen entre sí. */
export function indexOfPhrase(haystack: string, phrase: string): number {
  if (!phrase) return -1;

  let from = 0;
  for (;;) {
    const i = haystack.indexOf(phrase, from);
    if (i < 0) return -1;

    const before = i > 0 ? haystack[i - 1] : '';
    if (!before || !WORDISH.test(before)) {
      const rest = haystack.slice(i + phrase.length);
      for (const suffix of PLURAL_SUFFIXES) {
        if (!rest.startsWith(suffix)) continue;
        const after = rest[suffix.length] ?? '';
        if (!after || !WORDISH.test(after)) return i;
      }
    }
    from = i + 1;
  }
}

export type ImpactEntry = {
  aliases: string[];
  impact: Impact;
  /** §3.2 — El azúcar añadida pesa distinto según dónde aparezca: impacto
   *  alto en los primeros 3 ingredientes, medio después. */
  positional?: boolean;
};

/**
 * §3.2 + §8 — Ingredientes que penalizan, con los nombres tal como aparecen
 * en etiquetas argentinas. El match es por substring con el alias MÁS LARGO
 * primero, así "azúcar de coco" (bajo) gana sobre "azúcar" (alto) y "aceite
 * de oliva extra virgen" (sin penalización) gana sobre "aceite de oliva
 * refinado" (medio).
 */
export const IMPACT_TABLE: ImpactEntry[] = [
  // ── Impacto alto (§3.2) ──
  // Aceites de semillas industriales refinados.
  {
    impact: 'alto',
    aliases: [
      'aceite de girasol', 'aceite de soja', 'aceite de maíz', 'aceite de maiz',
      'aceite de canola', 'aceite de colza', 'aceite de cártamo', 'aceite de cartamo',
      'aceite de algodón', 'aceite de algodon', 'aceite de uva', 'aceite de pepita',
      'sunflower oil', 'soybean oil', 'soy oil', 'corn oil', 'canola oil',
      'rapeseed oil', 'safflower oil', 'cottonseed oil', 'grapeseed oil',
      // §8: "aceite vegetal (sin especificar → tratar como aceite de semilla
      // industrial por defecto)".
      'aceites vegetales', 'aceite vegetal', 'vegetable oils', 'vegetable oil',
      'grasa vegetal', 'vegetable fat',
    ],
  },
  // Proteínas aisladas industriales.
  {
    impact: 'alto',
    aliases: [
      'proteína de soja aislada', 'proteina de soja aislada', 'aislado de proteína de soja',
      'aislado de soja', 'proteína aislada de suero', 'proteina aislada de suero',
      'aislado de suero', 'whey isolate', 'whey protein isolate', 'soy protein isolate',
      'proteína de guisante aislada', 'proteína aislada', 'proteina aislada',
      'pea protein isolate',
    ],
  },
  // Azúcar refinada añadida — posicional (§3.2: alto en los primeros 3).
  {
    impact: 'alto',
    positional: true,
    aliases: [
      'jarabe de maíz de alta fructosa', 'jarabe de maiz de alta fructosa',
      'jarabe de fructosa', 'jarabe de glucosa', 'jarabe de maíz', 'jarabe de maiz',
      'high fructose corn syrup', 'corn syrup', 'glucose syrup',
      'azúcar refinada', 'azucar refinada', 'azúcar', 'azucar', 'sugar',
      'dextrosa', 'dextrose', 'maltosa', 'maltose',
    ],
  },
  // Harinas refinadas como ingrediente principal.
  {
    impact: 'alto',
    aliases: [
      'harina de trigo 0000', 'harina de trigo 000', 'harina refinada', 'harina blanca',
      'harina de trigo enriquecida', 'harina de trigo', 'wheat flour', 'enriched flour',
      'refined flour',
    ],
  },
  // Saborizantes artificiales.
  {
    impact: 'alto',
    aliases: [
      'saborizante artificial', 'saborizantes artificiales', 'aroma artificial',
      'aromas artificiales', 'idéntico al natural', 'identico al natural',
      'artificial flavor', 'artificial flavour',
    ],
  },
  // Colorantes artificiales que NO están en la lista de anulación (§4.1 nota:
  // un solo colorante azoico en producto no infantil → impacto alto).
  {
    impact: 'alto',
    aliases: [
      'tartrazina', 'e102', 'amarillo ocaso', 'e110', 'carmoisina', 'e122',
      'rojo allura', 'e129', 'azorrubina', 'amaranto', 'e123', 'tartrazine',
      'allura red', 'sunset yellow',
    ],
  },
  // Potenciadores de sabor — §8 los marca "impacto medio-alto" y marcador NOVA 4.
  {
    impact: 'alto',
    aliases: [
      'glutamato monosódico', 'glutamato monosodico', 'glutamato de sodio', 'e621',
      'inosinato disódico', 'inosinato disodico', 'e631', 'guanilato disódico',
      'guanilato disodico', 'e627', 'monosodium glutamate', 'msg',
    ],
  },

  // ── Impacto medio (§3.2) ──
  // Emulsionantes y estabilizantes industriales.
  {
    impact: 'medio',
    aliases: [
      'lecitina de soja', 'lecitina de girasol', 'lecitina', 'e322', 'lecithin',
      'mono y diglicéridos', 'mono y digliceridos', 'monoglicéridos', 'monogliceridos',
      'diglicéridos', 'digliceridos', 'e471', 'e472',
      'carragenina', 'carragenano', 'carrageenan', 'e407',
      'goma xantana', 'xanthan gum', 'e415', 'goma guar', 'guar gum', 'e412',
      'goma arábiga', 'goma arabiga', 'gum arabic', 'e414',
      'carboximetilcelulosa', 'e466',
      'almidón modificado', 'almidon modificado', 'modified starch',
    ],
  },
  // Conservantes.
  {
    impact: 'medio',
    aliases: [
      'sorbato de potasio', 'potassium sorbate', 'e202',
      'benzoato de sodio', 'sodium benzoate', 'e211',
      'propionato de calcio', 'calcium propionate', 'e282',
      'bha', 'e320', 'bht', 'e321', 'nisina', 'e234',
    ],
  },
  // Edulcorantes sintéticos.
  {
    impact: 'medio',
    aliases: [
      'aspartamo', 'aspartame', 'e951',
      'acesulfame potásico', 'acesulfame potasico', 'acesulfame k', 'acesulfame', 'e950',
      'sucralosa', 'sucralose', 'e955',
      'sacarina', 'saccharin', 'e954',
      'ciclamato', 'cyclamate', 'e952',
    ],
  },
  // Aceite de oliva refinado y mezclas — §3.2.
  {
    impact: 'medio',
    aliases: [
      'aceite de oliva refinado', 'aceite de oliva suave', 'aceite de oliva virgen',
      'refined olive oil', 'mezcla de aceite de oliva', 'aceite de oliva y girasol',
    ],
  },

  // ── Impacto bajo (§3.2) ──
  // Azúcares de fuentes tradicionales en cantidad moderada.
  {
    impact: 'bajo',
    aliases: [
      'azúcar de coco', 'azucar de coco', 'azúcar mascabo', 'azucar mascabo',
      'panela', 'miel', 'honey', 'dulce de leche', 'jarabe de arce', 'maple syrup',
    ],
  },
  // Almidón de maíz simple (no modificado).
  {
    impact: 'bajo',
    aliases: ['almidón de maíz', 'almidon de maiz', 'fécula de maíz', 'fecula de maiz', 'corn starch', 'cornstarch'],
  },
  // Saborizantes naturales no especificados — falta de transparencia (§3.2).
  {
    impact: 'bajo',
    aliases: ['saborizante natural', 'saborizantes naturales', 'aroma natural', 'aromas naturales', 'saborizante', 'saborizantes', 'natural flavor', 'natural flavour'],
  },
  // Stevia — §8: "impacto bajo, origen natural aunque procesado".
  {
    impact: 'bajo',
    aliases: ['glucósidos de esteviol', 'glucosidos de esteviol', 'steviol', 'stevia', 'e960'],
  },

  // ── Sin penalización (§3.2) — alineados con la filosofía Fitogenix ──
  {
    impact: 'none',
    aliases: [
      'aceite de oliva extra virgen', 'extra virgin olive oil', 'aceite de oliva',
      'olive oil', 'aceite de coco', 'coconut oil', 'ghee', 'clarified butter',
      'manteca', 'mantequilla', 'butter', 'crema de leche',
      'sal marina', 'sal fina', 'sal', 'salt',
      'vinagre', 'vinegar', 'jugo de limón', 'jugo de limon', 'lemon juice',
      'ácido cítrico', 'acido citrico', 'citric acid',
      'fermentos lácticos', 'fermentos lacticos', 'fermentos', 'cultivos activos',
      'cultivos lácticos', 'cultivos lacticos', 'live cultures',
      'cuajo', 'rennet',
      'cacao', 'pasta de cacao', 'cocoa', 'cocoa mass',
      'extracto de vainilla', 'vainilla', 'vanilla extract',
      'canela', 'cinnamon', 'orégano', 'oregano', 'pimienta', 'pepper',
      'comino', 'pimentón', 'pimenton', 'perejil', 'albahaca', 'romero', 'laurel',
      'ajo', 'garlic', 'cebolla', 'onion',
    ],
  },
];

/**
 * §3.4 — "Azúcar en jugo de fruta (aunque sea 100% natural, sin azúcar
 * añadida) → penalización media: la OMS lo clasifica como azúcar libre al
 * perder la fibra y la matriz."
 *
 * Es la regla de contexto más importante del spec y la más fácil de violar:
 * un jugo declara "Jugo de naranja" o directamente "Manzana", matchea el
 * arquetipo de fruta entera y se lleva 96 puntos. Decirle al usuario que un
 * jugo exprimido equivale a comerse la fruta es exactamente la confusión que
 * §3.4 existe para evitar.
 */
export const FRUIT_JUICE_PATTERN = /\bjugos?\b|\bzumos?\b|\bjuice\b|\bn[eé]ctar(?:es)?\b|\bexprimido\b/i;

/** Góndola de bebidas: una "manzana" acá es jugo de manzana, no una manzana. */
export const DRINK_CATEGORY_PATTERN = /bebida|gaseosa|refresco|jugo|zumo|juice|drink|beverage/i;

/**
 * §3.3 — Patrón de aditivo industrial. Un ingrediente que matchea esto pero
 * no está en IMPACT_TABLE se penaliza como impacto MEDIO por defecto: "la
 * ausencia de clasificación específica no equivale a sin riesgo".
 */
export const ADDITIVE_PATTERN =
  /\be\s?\d{3,4}\b|emulsionante|emulsificante|estabilizante|estabilizador|conservante|conservador|colorante|potenciador de sabor|antiaglomerante|antioxidante sintético|humectante|espesante|acidulante|regulador de acidez|emulsifier|preservative|stabili[sz]er|colou?ring agent|thickener|anticaking|flavou?r enhancer|humectant/i;

/**
 * §5 — Marcadores que identifican un producto NOVA 4 en el listado de
 * ingredientes, cuando OFF no trae `nova_group`. Cuantos más marcadores,
 * mayor la deducción.
 */
export const NOVA4_MARKERS =
  /\be\s?4\d{2}\b|emulsionante|saborizante|aroma artificial|proteína aislada|proteina aislada|almidón modificado|almidon modificado|colorante|aspartamo|sucralosa|acesulfame|sacarina|glutamato|e621|bha\b|bht\b|jarabe de maíz|jarabe de maiz/i;

/**
 * §3.1 — Productos de ingrediente único o mínimo. Cuando TODOS los
 * ingredientes del producto caen dentro del perfil, el puntaje base es alto
 * por defecto: el producto se puntúa por lo que ES, no por lo que evita.
 *
 * `base` es el punto medio del rango del documento (§11 exige consistencia:
 * el mismo producto tiene que dar siempre el mismo puntaje, así que no hay
 * rangos en runtime). `max` es el techo del rango — el modificador NOVA no
 * puede empujar el producto por encima de su propio arquetipo (si no, un
 * huevo NOVA 1 se iría a 100 y rompería la calibración de §9).
 */
export type WholeFoodProfile = {
  id: string;
  base: number;
  max: number;
  /** Al menos uno de estos tiene que estar presente. */
  required: string[];
  /** Además de `required`, solo estos pueden aparecer. */
  allowed: string[];
  /**
   * Alternativa a `required`: la categoría del producto delata el arquetipo
   * aunque el listado de ingredientes no lo nombre. Un queso declara "leche,
   * sal, cuajo, fermentos" — la palabra "queso" no aparece por ningún lado.
   */
  categoryPattern?: RegExp;
  /**
   * Azúcar máxima (g/100g) compatible con el arquetipo. El panel nutricional
   * es un control cruzado contra listas de ingredientes incompletas: los
   * datos de OFF son colaborativos, y una gaseosa cargada con un único
   * ingrediente "Agua" recibiría el puntaje del agua mineral. Si el panel
   * desmiente al listado, el arquetipo no aplica y el producto cae a la
   * evaluación normal.
   */
  maxSugars?: number;
};

const SEASONING = ['sal', 'salt', 'agua', 'water'];

export const WHOLE_FOOD_PROFILES: WholeFoodProfile[] = [
  {
    id: 'agua',
    base: 97, max: 100,
    maxSugars: 0.5,
    required: ['agua mineral', 'agua de manantial', 'agua'],
    allowed: ['minerales', 'sales minerales'],
  },
  {
    id: 'fruta-verdura-huevo',
    // §3.1 da 92-98 para el arquetipo, pero §9 acota "Huevos frescos 92-96".
    // Manda §9: es la tabla de calibración, y el techo es lo que impide que
    // el bonus NOVA 1 se lleve el puntaje al tope del arquetipo.
    base: 94, max: 96,
    required: [
      'huevo', 'huevos', 'egg', 'banana', 'manzana', 'naranja', 'pera', 'frutilla',
      'durazno', 'ananá', 'anana', 'uva', 'ciruela', 'mandarina', 'limón', 'limon',
      'palta', 'tomate', 'lechuga', 'espinaca', 'zanahoria', 'brócoli', 'brocoli',
      'zapallo', 'calabaza', 'papa', 'batata', 'cebolla', 'ajo', 'pepino', 'morrón', 'morron',
    ],
    allowed: [...SEASONING, 'fruta', 'verdura', 'canela', 'avena', 'avena integral'],
  },
  {
    id: 'aceite-oliva-virgen',
    base: 91, max: 95,
    maxSugars: 1,
    required: ['aceite de oliva extra virgen', 'extra virgin olive oil'],
    allowed: [],
  },
  {
    id: 'carne-pescado-pollo',
    base: 89, max: 93,
    maxSugars: 3,
    categoryPattern: /carne|pollo|pescado|pechuga|meat|chicken|fish/i,
    required: [
      'carne', 'carne vacuna', 'pollo', 'pechuga', 'pescado', 'merluza', 'salmón',
      'salmon', 'atún', 'atun', 'cerdo', 'pavo', 'chicken', 'beef', 'fish',
    ],
    allowed: SEASONING,
  },
  {
    id: 'legumbres',
    base: 88, max: 92,
    required: ['lenteja', 'lentejas', 'garbanzo', 'garbanzos', 'poroto', 'porotos', 'arveja', 'arvejas', 'soja', 'frijol', 'lentils', 'chickpeas'],
    allowed: SEASONING,
  },
  {
    id: 'frutos-secos',
    base: 86, max: 90,
    required: ['almendra', 'almendras', 'nuez', 'nueces', 'castaña', 'castañas', 'avellana', 'avellanas', 'maní', 'mani', 'pistacho', 'semillas de girasol', 'almonds', 'walnuts', 'peanuts'],
    allowed: SEASONING,
  },
  {
    id: 'yogur-natural',
    base: 86, max: 90,
    maxSugars: 8,
    categoryPattern: /yogur|yoghurt|yogurt/i,
    required: ['yogur', 'yoghurt', 'yogurt'],
    allowed: ['leche', 'leche entera', 'fermentos lácticos', 'fermentos lacticos', 'fermentos', 'cultivos activos', 'cultivos lácticos', 'cultivos lacticos'],
  },
  {
    id: 'manteca',
    base: 84, max: 88,
    categoryPattern: /manteca|mantequilla|butter/i,
    required: ['manteca', 'mantequilla', 'butter'],
    allowed: [...SEASONING, 'crema de leche', 'crema'],
  },
  {
    id: 'cereal-integral',
    base: 84, max: 88,
    required: ['avena', 'avena integral', 'arroz integral', 'quinoa', 'oats', 'brown rice'],
    allowed: SEASONING,
  },
  {
    id: 'queso-simple',
    base: 82, max: 86,
    maxSugars: 6,
    categoryPattern: /queso|cheese/i,
    required: ['queso'],
    allowed: [...SEASONING, 'leche', 'leche entera', 'fermentos lácticos', 'fermentos lacticos', 'fermentos', 'cuajo', 'rennet'],
  },
];

/**
 * §3.1 — Producto de pocos ingredientes, todos sin penalización, que no
 * matchea ningún arquetipo de la tabla. Sigue siendo un alimento real: base
 * alta, pero por debajo de los arquetipos nombrados.
 */
export const GENERIC_WHOLE_FOOD = { base: 88, max: 92, maxIngredients: 4, maxSugars: 8 };

/** §4.1 — Compuertas de anulación total: fuerzan la categoría Malo (0-24). */
export type AnnulGate = {
  id: string;
  /** Patrón sobre el texto de ingredientes. */
  pattern: RegExp;
  /** Tags de aditivo de OFF que también disparan la compuerta. */
  additiveTags?: string[];
  reason: string;
};

export const ANNUL_GATES: AnnulGate[] = [
  {
    id: 'grasa-trans',
    pattern: /parcialmente\s+hidrogenad|aceite\s+vegetal\s+hidrogenad|grasa\s+vegetal\s+hidrogenad|aceite\s+hidrogenad|grasa\s+hidrogenad|partially\s+hydrogenated|hydrogenated\s+(?:oil|fat)/i,
    reason:
      'Contiene aceite parcialmente hidrogenado (grasa trans industrial). La OMS solicita su eliminación global desde 2018; no hay nivel de consumo seguro reconocido. Argentina adoptó política de eliminación.',
  },
  {
    id: 'dioxido-titanio',
    pattern: /dióxido de titanio|dioxido de titanio|titanium dioxide|\be\s?171\b/i,
    additiveTags: ['en:e171'],
    reason:
      'Contiene dióxido de titanio (E171). EFSA retiró la aprobación en 2021 por preocupaciones de genotoxicidad; la UE lo prohibió en alimentos en 2022.',
  },
  {
    id: 'eritrosina',
    pattern: /eritrosina|erythrosine|rojo no\.? 3|red no\.? 3|\be\s?127\b/i,
    additiveTags: ['en:e127'],
    reason:
      'Contiene eritrosina (E127, Rojo No. 3). La FDA revocó su autorización para uso en alimentos en enero de 2025 citando evidencia de cáncer.',
  },
  {
    id: 'bromato-potasio',
    pattern: /bromato de potasio|potassium bromate|\be\s?924\b/i,
    additiveTags: ['en:e924'],
    reason:
      'Contiene bromato de potasio (E924). Prohibido en la UE, Canadá y por el CAA argentino; IARC Grupo 2B.',
  },
];

/**
 * §4.1 punto 6 — Colorantes azoicos con advertencia obligatoria en la UE.
 * Anulan solo si hay 2 o más en el mismo producto, o si el producto está
 * dirigido a niños. Uno solo en producto no infantil → impacto alto (ya
 * cubierto por IMPACT_TABLE).
 */
export const AZO_COLORANTS: { name: string; pattern: RegExp; tag: string }[] = [
  { name: 'tartrazina (E102)',   pattern: /tartrazina|tartrazine|\be\s?102\b/i, tag: 'en:e102' },
  { name: 'amarillo ocaso (E110)', pattern: /amarillo ocaso|sunset yellow|\be\s?110\b/i, tag: 'en:e110' },
  { name: 'carmoisina (E122)',   pattern: /carmoisina|azorrubina|carmoisine|\be\s?122\b/i, tag: 'en:e122' },
  { name: 'amaranto (E123)',     pattern: /amaranto|amaranth|\be\s?123\b/i, tag: 'en:e123' },
  { name: 'rojo allura (E129)',  pattern: /rojo allura|allura red|\be\s?129\b/i, tag: 'en:e129' },
];

/** §4.1 punto 6 — "cualquiera de ellos en producto dirigido a niños". */
export const CHILDREN_PRODUCT_PATTERN =
  /\b(infantil|infantiles|niños|ninos|kids|bebé|bebe|baby|junior)\b/i;

/**
 * §4.1 punto 2 — El nitrito/nitrato solo anula en producto CÁRNICO PROCESADO.
 * El motor anterior usaba `nova_group === 4` como proxy, que también atrapaba
 * cualquier ultraprocesado no cárnico.
 */
export const PROCESSED_MEAT_PATTERN =
  /fiambre|salchich|jamón|jamon|mortadela|salame|salamín|salamin|chorizo|bondiola|panceta|bacon|paleta|leberwurst|morcilla|hamburguesa|carne procesada|embutido|sausage|ham\b|deli meat/i;

export const NITRITE_PATTERN =
  /nitrito de sodio|nitrato de sodio|nitrito de potasio|nitrato de potasio|sodium nitrite|sodium nitrate|potassium nitrite|potassium nitrate|\be\s?24[9]\b|\be\s?25[012]\b/i;
export const NITRITE_TAGS = ['en:e249', 'en:e250', 'en:e251', 'en:e252'];

/** §8 — Inhibidores de nitrosación: bajan la anulación a techo 49. */
export const ASCORBATE_PATTERN =
  /ascorbato de sodio|eritorbato de sodio|ácido ascórbico|acido ascorbico|ascorbato|eritorbato|ascorbic acid|erythorbate|\be\s?3(?:00|01|15|16)\b/i;
export const ASCORBATE_TAGS = ['en:e300', 'en:e301', 'en:e315', 'en:e316'];

/** §1 — Puntaje → categoría. */
export const TIERS = [
  { min: 75, tier: 'Excelente' as const, color: '#16a34a', message: 'Lo recomendamos' },
  { min: 50, tier: 'Bueno' as const,     color: '#84cc16', message: 'Buena opción' },
  { min: 25, tier: 'Moderado' as const,  color: '#f97316', message: 'Consúmelo con consciencia' },
  { min: 0,  tier: 'Malo' as const,      color: '#dc2626', message: 'No lo recomendamos' },
];

// ── Índice de matching: alias más largo primero (longest-match gana) ──
type ImpactIndexEntry = { alias: string; impact: Impact; positional: boolean };

const IMPACT_INDEX: ImpactIndexEntry[] = IMPACT_TABLE.flatMap((e) =>
  e.aliases.map((alias) => ({
    alias: alias.toLowerCase(),
    impact: e.impact,
    positional: e.positional ?? false,
  })),
).sort((a, b) => b.alias.length - a.alias.length);

export type ImpactMatch = { impact: Impact; positional: boolean } | null;

/**
 * §8 — Abreviaturas de las etiquetas argentinas. El rotulado nacional declara
 * la CLASE del aditivo abreviada más su número INS, no el nombre completo:
 * "COL 150 d" es colorante caramelo, "ACI 338" ácido fosfórico, "ARO" aroma.
 * El spec lista los nombres completos y no contempla esta notación, así que
 * sin esta tabla todos estos aditivos caían como "alimento no reconocido".
 *
 * El número, cuando está, manda: "COL 102" es tartrazina (impacto alto) y no
 * un colorante genérico. Si no se puede identificar, se aplica el default de
 * §3.3 para aditivos sin clasificar: impacto medio.
 */
const LABEL_ABBREVIATIONS: { prefix: RegExp; label: string }[] = [
  { prefix: /^col\b/i,  label: 'Colorante' },
  { prefix: /^aro\b/i,  label: 'Aroma' },
  { prefix: /^aci\b/i,  label: 'Acidulante' },
  { prefix: /^cons\b/i, label: 'Conservante' },
  { prefix: /^est\b/i,  label: 'Estabilizante' },
  { prefix: /^edu\b/i,  label: 'Edulcorante' },
  { prefix: /^ant\b/i,  label: 'Antioxidante' },
  { prefix: /^emu\b/i,  label: 'Emulsionante' },
  { prefix: /^esp\b/i,  label: 'Espesante' },
  { prefix: /^hum\b/i,  label: 'Humectante' },
  { prefix: /^ega\b/i,  label: 'Estabilizante de gases' },
  { prefix: /^res\b/i,  label: 'Regulador de acidez' },
];

export type AbbreviationMatch = { label: string; impact: Impact };

/**
 * §8 — Resuelve "COL 150 d" / "ACI 338" / "ARO" a su clase y su impacto.
 * Devuelve `null` si el fragmento no tiene forma de abreviatura de rotulado.
 */
export function resolveLabelAbbreviation(name: string): AbbreviationMatch | null {
  const n = name.trim();
  for (const { prefix, label } of LABEL_ABBREVIATIONS) {
    if (!prefix.test(n)) continue;

    // El número INS identifica el aditivo concreto: "COL 102" → E102.
    const digits = n.match(/\d{3,4}/)?.[0];
    if (digits) {
      const byNumber = rubricImpact(`e${digits}`);
      if (byNumber) return { label: `${label} E${digits}`, impact: byNumber.impact };
      return { label: `${label} E${digits}`, impact: 'medio' };
    }

    return { label, impact: 'medio' };
  }
  return null;
}

/**
 * §3.2/§3.3 — Impacto de un ingrediente según la rúbrica. `null` si la
 * rúbrica no tiene opinión (el motor cae entonces a ingredientData o a la
 * regla de aditivo desconocido).
 */
export function rubricImpact(name: string): ImpactMatch {
  const all = rubricMatches(name);
  if (all.length === 0) return null;
  // El peor impacto manda: un fragmento como "AGUA CARBONATADA AZUCARES"
  // (el OCR se comió la coma) contiene agua y azúcar, y lo que define al
  // producto es el azúcar, no que el alias más largo haya sido otro.
  const order: Impact[] = ['alto', 'medio', 'bajo', 'none'];
  const worst = all.slice().sort((a, b) => order.indexOf(a.impact) - order.indexOf(b.impact))[0];
  return { impact: worst.impact, positional: worst.positional };
}

export type RubricMatch = { term: string; impact: Impact; positional: boolean };

/**
 * TODAS las sustancias de la rúbrica presentes en el fragmento, sin
 * superponerse (gana el alias más largo en cada tramo del texto).
 *
 * Existe porque un fragmento no siempre es un ingrediente: cuando el rotulado
 * viene mal parseado, "AGUA CARBONATADA AZUCARES" es uno solo. Emitir una
 * única entrada por fragmento hacía que se mostrara el nombre de una
 * sustancia con el color de otra — al usuario le aparecía "Agua" en rojo.
 */
export function rubricMatches(name: string): RubricMatch[] {
  const n = name.toLowerCase().trim();
  const found: RubricMatch[] = [];
  const taken: [number, number][] = [];

  for (const entry of IMPACT_INDEX) {
    const at = indexOfPhrase(n, entry.alias);
    if (at < 0) continue;
    const end = at + entry.alias.length;
    if (taken.some(([s, e]) => at < e && s < end)) continue; // ya cubierto por uno más largo
    taken.push([at, end]);
    found.push({ term: entry.alias, impact: entry.impact, positional: entry.positional });
  }

  return found;
}

/** ¿El ingrediente cae dentro de este perfil de alimento entero? */
function matchesAny(name: string, patterns: string[]): boolean {
  const n = name.toLowerCase().trim();
  return patterns.some((p) => matchesPhrase(n, p.toLowerCase()));
}

/**
 * §3.1 — Perfil de alimento entero que cubre a TODOS los ingredientes
 * parseados, o `null`. "Cualquier ingrediente adicional fuera de los
 * descritos activa la evaluación de ingredientes."
 */
export function matchWholeFoodProfile(
  ingredientNames: string[],
  categories = '',
  sugars?: number,
): WholeFoodProfile | null {
  if (ingredientNames.length === 0) return null;

  for (const profile of WHOLE_FOOD_PROFILES) {
    const universe = [...profile.required, ...profile.allowed];
    const allInside = ingredientNames.every((n) => matchesAny(n, universe));
    if (!allInside) continue;

    const hasRequired = ingredientNames.some((n) => matchesAny(n, profile.required));
    const categorySaysSo = profile.categoryPattern?.test(categories) ?? false;
    if (!hasRequired && !categorySaysSo) continue;

    // El panel desmiente al listado: no es el alimento que dice ser.
    if (profile.maxSugars != null && sugars != null && sugars > profile.maxSugars) continue;

    return profile;
  }

  return null;
}
