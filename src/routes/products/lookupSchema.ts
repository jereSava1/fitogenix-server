/**
 * Contrato de respuesta de POST /products/lookup, como JSON Schema.
 *
 * ── FUENTE DE VERDAD ──
 * `src/types/fitogenix.ts` (tipo `FitogenixProduct`) junto con los tipos del
 * motor en `src/domain/product/ftgEngine.ts` (`ScoreBreakdown`,
 * `AnalyzedIngredient`, `NutritionFacts`, `ScoreStep`). Este archivo NO define
 * el contrato: lo TRANSCRIBE a JSON Schema para que Fastify lo serialice, y
 * queda atado a los tipos en tiempo de compilación (ver los `satisfies
 * Record<keyof …>` de abajo). Si alguien agrega un campo al tipo y se olvida
 * de agregarlo acá, `npx tsc --noEmit` no compila.
 *
 * ── ESPEJO DEL CLIENTE ──
 * Los tipos espejo de la app native viven en
 * `fitogenix-native/src/lib/contracts/`. El cliente NO recalcula scoring: solo
 * renderiza estos campos (incluidos `scoreLabel`, `scoreColor`, `tagline` y
 * `fito`, que ya vienen derivados del servidor). Todo cambio acá hay que
 * reflejarlo allá.
 *
 * ── Por qué schema de respuesta y no solo un tipo de TypeScript ──
 * 1. El contrato queda EXPLÍCITO: hoy el cliente depende de "lo que el
 *    servidor haya devuelto ese día", que es justamente lo que se rompió al
 *    pasar de v2 a v2.1 (se fue `subscores`, `breakdown.components` pasó a
 *    `breakdown.steps[]`, `score` puede ser `null`).
 * 2. fast-json-stringify serializa bastante más rápido que el JSON.stringify
 *    genérico de Fastify.
 * 3. Es un FILTRO: toda propiedad que no esté declarada acá se ELIMINA de la
 *    respuesta, en silencio. Eso es una garantía (nunca se filtra un campo
 *    interno) y un riesgo (un campo nuevo no declarado desaparece) — por eso
 *    los `satisfies`.
 *
 * ── Nota sobre `null` ──
 * `score`, `noScore`, `breakdown`, `subtitle`, `imageUrl`, `ceiling` y cada
 * campo de `nutrition` son legítimamente nulos. Se declaran como
 * `type: ['<tipo>', 'null']` — fast-json-stringify los emite como `null`, NO
 * los coerciona a 0 ni los omite. Un `score: null` significa "el motor decidió
 * no puntuar" (§1), no "puntaje cero".
 *
 * Los `enum` de dominio (`impact`, `sev`, `tier`, `confidence`, `kind`,
 * `noScore.code`) se declaran como `string` a propósito: el tipo estricto ya
 * vive en TypeScript, y un enum en el serializador convertiría un valor nuevo
 * del motor en un 500 en producción en vez de en un error de compilación.
 */

import type { FitogenixProduct } from '../../types/fitogenix';
import type {
  AnalyzedIngredient,
  NutritionFacts,
  ScoreBreakdown,
  ScoreStep,
} from '../../domain/product/ftgEngine';

/** Un nodo de JSON Schema. Suelto a propósito: acá el que tipa es el `satisfies`. */
type SchemaNode = Record<string, unknown>;

const STRING: SchemaNode = { type: 'string' };
const NULLABLE_STRING: SchemaNode = { type: ['string', 'null'] };
const NUMBER: SchemaNode = { type: 'number' };
const NULLABLE_NUMBER: SchemaNode = { type: ['number', 'null'] };
const BOOLEAN: SchemaNode = { type: 'boolean' };
const STRING_ARRAY: SchemaNode = { type: 'array', items: { type: 'string' } };

/** Panel nutricional por 100 g/ml. Todo campo puede faltar en el origen. */
const nutritionProperties = {
  calories: NULLABLE_NUMBER,
  protein: NULLABLE_NUMBER,
  carbs: NULLABLE_NUMBER,
  sugars: NULLABLE_NUMBER,
  fats: NULLABLE_NUMBER,
  satFats: NULLABLE_NUMBER,
  sodium: NULLABLE_NUMBER,
  fiber: NULLABLE_NUMBER,
  transFat: NULLABLE_NUMBER,
  cholesterol: NULLABLE_NUMBER,
} satisfies Record<keyof NutritionFacts, SchemaNode>;

/** §7 — cada ingrediente con su posición en la etiqueta y cuánto restó. */
const ingredientProperties = {
  name: STRING,
  position: NUMBER,
  impact: STRING, // 'alto' | 'medio' | 'bajo' | 'none' | 'desconocido'
  delta: NUMBER,
  sev: STRING, // 'red' | 'orange' | 'yellow' | 'green' | 'gray'
  desc: STRING,
  flag: BOOLEAN,
  marker: BOOLEAN,
  percent: NUMBER,
  detail: STRING,
} satisfies Record<keyof AnalyzedIngredient, SchemaNode>;

/**
 * §7 regla 1 — la cuenta paso por paso. Reemplaza a `breakdown.components`
 * (los 4 ejes de v2), que ya no existe. `delta` es null en los pasos que FIJAN
 * un valor en vez de sumarlo (base, ancla, techo, anulación).
 */
const stepProperties = {
  kind: STRING, // 'base' | 'ancla' | 'ingrediente' | 'procesamiento' | …
  label: STRING,
  delta: NULLABLE_NUMBER,
  running: NUMBER,
  detail: STRING,
} satisfies Record<keyof ScoreStep, SchemaNode>;

const breakdownProperties = {
  engineVersion: STRING,
  score: NULLABLE_NUMBER,
  scoreAvailable: BOOLEAN,
  noScore: {
    type: ['object', 'null'],
    properties: { code: STRING, message: STRING },
  },
  tier: STRING,
  tierColor: STRING,
  tierMessage: STRING,
  steps: { type: 'array', items: { type: 'object', properties: stepProperties } },
  ingredients: {
    type: 'array',
    items: { type: 'object', properties: ingredientProperties },
  },
  processing: {
    type: 'object',
    properties: { markers: STRING_ARRAY, modifier: NUMBER, text: STRING },
  },
  fitogenixView: STRING,
  annulments: STRING_ARRAY,
  ceiling: {
    type: ['object', 'null'],
    properties: { value: NUMBER, reason: STRING },
  },
  warnings: STRING_ARRAY, // octógonos de la Ley 27.642
  allergenWarnings: STRING_ARRAY,
  notices: STRING_ARRAY,
  unidentified: STRING_ARRAY, // §9 — cola de curaduría
  coverage: NUMBER,
  confidence: STRING, // 'alta' | 'media' | 'baja'
  disclaimer: {
    type: 'object',
    properties: { framing: STRING, footer: STRING },
  },
} satisfies Record<keyof ScoreBreakdown, SchemaNode>;

const productProperties = {
  id: STRING,
  name: STRING,
  subtitle: NULLABLE_STRING,
  brand: STRING,
  category: STRING,
  categoryEmoji: STRING,

  // `null` = el motor NO puntúa este producto (§1). Nunca 0, nunca un valor
  // conservador: "la ausencia de datos nunca mejora un puntaje".
  score: NULLABLE_NUMBER,
  scoreAvailable: BOOLEAN,
  noScore: {
    type: ['object', 'null'],
    properties: { code: STRING, message: STRING },
  },

  flagged: BOOLEAN,
  emoji: STRING,
  bgColor: STRING,
  imageUrl: NULLABLE_STRING,
  ingredients: {
    type: 'array',
    items: { type: 'object', properties: ingredientProperties },
  },
  nutrition: { type: 'object', properties: nutritionProperties },
  breakdown: { type: ['object', 'null'], properties: breakdownProperties },
  dataSource: STRING, // off | obf | edamam | ai
  aiEnriched: BOOLEAN,
  productId: STRING, // uuid de products.id — con esto el cliente guarda/quita
  scoreLabel: STRING,
  scoreColor: STRING,
  tagline: STRING,
  fito: STRING, // 'fito' | 'nofito' | 'none'
} satisfies Record<keyof FitogenixProduct, SchemaNode>;

/**
 * `required` SOLO en el nivel superior, y sin `aiEnriched` (es opcional en el
 * tipo). fast-json-stringify LANZA si falta un campo requerido, así que la
 * lista es exactamente lo que `mapOFFToProduct` produce siempre: un payload al
 * que le falte algo de esto está roto y es mejor un 500 ruidoso que un
 * producto a medias que el cliente no sabe renderizar.
 *
 * Los objetos anidados van SIN `required` a propósito, para acotar el radio de
 * explosión: que un campo nuevo del breakdown se omita no debería tumbar la
 * respuesta entera.
 */
const REQUIRED_TOP_LEVEL = (
  Object.keys(productProperties) as (keyof FitogenixProduct)[]
).filter((k) => k !== 'aiEnriched');

export const lookupResponseSchema = {
  200: {
    type: 'object',
    properties: productProperties,
    required: REQUIRED_TOP_LEVEL,
  },
  404: {
    type: 'object',
    properties: { error: STRING },
    required: ['error'],
  },
};
