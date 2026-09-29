/* =========================================================
   FITOGENIX - S5 - ANULACIONES

   Fuerzan la categoria Malo. Ningun otro componente los compensa.

   Las dos reglas de cierre son lo que las hace dificiles de esquivar: la de
   las grasas se define por el PROCESO declarado ("hidrogenad-",
   "endurecid-") y no por coincidencia exacta de nombre, y la del curado
   alcanza a los agentes vegetales porque su funcion en un fiambre es
   identica a la del nitrito de sodio.
========================================================= */

import type { AnnulGate, AzoColorant } from '../types';

export const HYDROGENATED_CLOSURE =
  /\b(?:aceite|aceites|grasa|grasas|manteca|margarina|materia grasa)\b[^,;]{0,40}\b(?:hidrogenad|endurecid)|(?:hidrogenad|endurecid)[a-z]*\s+(?:aceite|grasa|manteca)|partially\s+hydrogenated|hydrogenated\s+(?:oil|fat|vegetable)/i;

/** §5.1 Excepción — grasa trans natural de lácteos o rumiantes. */
export const NATURAL_TRANS_PATTERN = /\b(?:leche|manteca|mantequilla|crema|queso|carne vacuna|cordero|rumiante)\b/i;

export const ANNUL_GATES: readonly AnnulGate[] = [
  {
    id: 'grasa-hidrogenada',
    pattern: HYDROGENATED_CLOSURE,
    reason:
      'Contiene grasa hidrogenada o endurecida (grasa trans industrial). La OMS solicita su eliminación global desde 2018; no existe nivel de consumo seguro reconocido. Argentina adoptó política de eliminación.',
  },
  {
    id: 'dioxido-titanio',
    pattern: /di[oó]xido de titanio|titanium dioxide|\be\s?171\b/i,
    additiveTags: ['en:e171'],
    reason:
      'Contiene dióxido de titanio (E171). EFSA retiró la aprobación en 2021 por genotoxicidad; la UE lo prohibió en alimentos en 2022.',
  },
  {
    id: 'eritrosina',
    pattern: /eritrosina|erythrosine|rojo no\.? 3|red no\.? 3|\be\s?127\b/i,
    additiveTags: ['en:e127'],
    reason:
      'Contiene eritrosina (E127, Rojo No. 3). La FDA revocó su autorización para alimentos en enero de 2025 citando evidencia de cáncer.',
  },
  {
    id: 'bromato-potasio',
    pattern: /bromato de potasio|potassium bromate|\be\s?924\b/i,
    additiveTags: ['en:e924'],
    reason:
      'Contiene bromato de potasio (E924). Prohibido en la UE, Canadá y por el CAA argentino; IARC Grupo 2B.',
  },
];

/** §5.6 — Colorantes azoicos. Anulan con 2 o más, o con cualquiera en producto
 *  dirigido a niños. Uno solo en producto no infantil → impacto Alto. */
export const AZO_COLORANTS: readonly AzoColorant[] = [
  { name: 'tartrazina (E102)',      pattern: /tartrazina|tartrazine|\be\s?102\b/i, tag: 'en:e102' },
  { name: 'amarillo ocaso (E110)',  pattern: /amarillo ocaso|amarillo cr[eé]p[uú]sculo|sunset yellow|\be\s?110\b/i, tag: 'en:e110' },
  { name: 'carmoisina (E122)',      pattern: /carmoisina|azorrubina|carmoisine|\be\s?122\b/i, tag: 'en:e122' },
  { name: 'amaranto (E123)',        pattern: /\bamaranto\b|\bamaranth\b|\be\s?123\b/i, tag: 'en:e123' },
  { name: 'rojo allura (E129)',     pattern: /rojo allura|allura red|\be\s?129\b/i, tag: 'en:e129' },
];

export const AZO_REASON = (names: readonly string[], children: boolean): string =>
  `Contiene ${names.join(', ')}${children ? ' en un producto dirigido a niños' : ''}. EFSA 2008 vinculó la combinación con hiperactividad infantil; la UE exige la advertencia "puede afectar la actividad y la atención de los niños".`;

export const CHILDREN_PRODUCT_PATTERN =
  /\b(infantil|infantiles|ni[nñ]os|kids|beb[eé]|baby|junior|golosina|golosinas)\b/i;

/* ── §5.2 Curado de cárnicos ─────────────────────────────────── */

export const PROCESSED_MEAT_PATTERN =
  /fiambre|salchich|jam[oó]n|mortadela|salame|salam[ií]n|chorizo|bondiola|panceta|bacon|paleta|leberwurst|morcilla|hamburguesa|carne procesada|embutido|sausage|\bham\b|deli meat|pastr[oó]n|matambre|lomito ahumado/i;

/** §5.2 — Agentes de curado DECLARADOS. */
export const CURING_AGENT_PATTERN =
  /nitrito de sodio|nitrato de sodio|nitrito de potasio|nitrato de potasio|sal de cura|sal nitritada|sodium nitrite|sodium nitrate|potassium nitrite|potassium nitrate|\be\s?249\b|\be\s?25[012]\b/i;
export const CURING_AGENT_TAGS: readonly string[] = ['en:e249', 'en:e250', 'en:e251', 'en:e252'];

/**
 * §5.2 — Agentes de curado VEGETALES.
 *
 * *Los agentes vegetales aportan nitrato que se convierte en nitrito durante
 * el curado. Su función en un fiambre es idéntica a la del nitrito de sodio:
 * conservar y dar color rosado. La diferencia es de etiqueta, no de química.*
 */
export const VEGETABLE_CURING_PATTERN =
  /polvo de apio|jugo de apio|cultivo de apio|extracto de apio|apio en polvo|extracto de acerola|polvo de acerola|extracto de espinaca|jugo de remolacha en polvo|remolacha en polvo|curado natural|curado vegetal|celery powder|celery juice|cultured celery/i;

export const VEGETABLE_CURING_NOTICE = (ingredient: string): string =>
  `Este producto se declara sin nitritos añadidos, pero usa ${ingredient} como agente de curado, que aporta nitratos que se convierten en nitrito durante el proceso. Lo evaluamos igual que a la sal de cura tradicional.`;

export const CURED_MEAT_REASON =
  'Agente de curado en un producto cárnico procesado sin ascorbato/eritorbato protector. IARC Grupo 1 para carne procesada curada; EFSA 2023 redujo los niveles permitidos por riesgo de nitrosaminas.';

export const CURED_MEAT_WITH_ASCORBATE_REASON =
  'Producto cárnico curado con ascorbato/eritorbato declarado, que inhibe la nitrosación. Techo de puntaje: 49.';

export const NITRITE_NON_MEAT_REASON =
  'Nitrito o nitrato añadido en un producto que no es cárnico. Impacto alto y techo de puntaje: 59.';

/** §5.2 — Inhibidores de nitrosación. */
export const ASCORBATE_PATTERN =
  /ascorbato de sodio|eritorbato de sodio|[aá]cido asc[oó]rbico|ascorbato|eritorbato|ascorbic acid|erythorbate|\be\s?3(?:00|01|15|16)\b/i;
export const ASCORBATE_TAGS: readonly string[] = ['en:e300', 'en:e301', 'en:e315', 'en:e316'];

/** §5.2 Excepción — nitrato natural en un vegetal donde el vegetal ES el
 *  alimento. */
export const VEGETABLE_AS_FOOD_PATTERN = /\b(espinaca|remolacha|r[uú]cula|acelga|lechuga|apio)\b/i;
