/**
 * Contrato de POST /products/lookup y del producto (`Product`), en TypeBox.
 *
 * ── DESDE K-01 (ADR-0011) ──
 * Estos schemas son los que Fastify usa para validar y serializar, y de acá
 * sale `contract/openapi.json` (`npm run contract:generate`; el CI falla si el
 * archivo commiteado no coincide). El JSON Schema que generan es IDÉNTICO al
 * que se escribía a mano antes de K-01: se migró la sintaxis, no la forma.
 * Siguen atados al tipo `FitogenixProduct` (application/productResponse.ts) y
 * a los del motor con `satisfies Record<keyof …>`: si alguien agrega un campo
 * al tipo y se olvida de agregarlo acá, `tsc` no compila. K-04 invierte la
 * relación (el tipo sale del schema con `Static<>`).
 *
 * ── ESPEJO DEL CLIENTE ──
 * Los tipos espejo de la app native viven en
 * `fitogenix-native/src/lib/contracts/` hasta K-05, que los genera desde el
 * OpenAPI. El cliente NO recalcula scoring: solo renderiza estos campos
 * (incluidos `scoreLabel`, `scoreColor`, `tagline` y `fito`, que ya vienen
 * derivados del servidor).
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
 * ── `breakdown` no viaja (2026-08-18) ──
 * El motor lo sigue calculando (ver `scoreProduct` en
 * `modules/scoring/index.ts`, usado internamente por ETL/auditoría), pero
 * `FitogenixProduct` ya NO tiene un campo `breakdown`: es información nuestra
 * (la cuenta paso por paso, base/ancla/técho/anulaciones) y no algo que un
 * usuario B2C necesite ver. La UI ya cubre el "por qué" con la lista de
 * ingredientes coloreada por severidad. Si algún día hace falta exponerlo
 * (soporte, panel admin, tier Plus), se agrega un endpoint aparte en vez de
 * inflar esta respuesta.
 *
 * ── Nota sobre `null` ──
 * `score`, `noScore`, `subtitle`, `imageUrl` y cada campo de `nutrition` son
 * legítimamente nulos. Se declaran como `type: ['<tipo>', 'null']` —
 * fast-json-stringify los emite como `null`, NO los coerciona a 0 ni los
 * omite. Un `score: null` significa "el motor decidió no puntuar" (§1), no
 * "puntaje cero".
 *
 * Los `enum` de dominio (`impact`, `sev`, `noScore.code`) se declaran como
 * `string` a propósito: el tipo estricto ya vive en TypeScript, y un enum en
 * el serializador convertiría un valor nuevo del motor en un 500 en
 * producción en vez de en un error de compilación.
 */

import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { ApiErrorSchema, Nullable } from '../../../platform/http/schemas';
import type { FitogenixProduct } from '../application/productResponse';
import type {
  AnalyzedIngredient,
  NutritionFacts,
} from '../../scoring';

const STRING = Type.String();
const NULLABLE_STRING = Nullable(Type.String());
const NUMBER = Type.Number();
const NULLABLE_NUMBER = Nullable(Type.Number());
const BOOLEAN = Type.Boolean();

/** Panel nutricional por 100 g/ml. Todo campo puede faltar en el origen. */
const nutritionProperties = {
  calories: Type.Optional(NULLABLE_NUMBER),
  protein: Type.Optional(NULLABLE_NUMBER),
  carbs: Type.Optional(NULLABLE_NUMBER),
  sugars: Type.Optional(NULLABLE_NUMBER),
  fats: Type.Optional(NULLABLE_NUMBER),
  satFats: Type.Optional(NULLABLE_NUMBER),
  sodium: Type.Optional(NULLABLE_NUMBER),
  fiber: Type.Optional(NULLABLE_NUMBER),
  transFat: Type.Optional(NULLABLE_NUMBER),
  cholesterol: Type.Optional(NULLABLE_NUMBER),
} satisfies Record<keyof NutritionFacts, TSchema>;

/** §7 — cada ingrediente con su posición en la etiqueta y cuánto restó. */
const ingredientProperties = {
  name: Type.Optional(STRING),
  position: Type.Optional(NUMBER),
  impact: Type.Optional(STRING), // 'alto' | 'medio' | 'bajo' | 'none' | 'desconocido'
  delta: Type.Optional(NUMBER),
  sev: Type.Optional(STRING), // 'red' | 'orange' | 'yellow' | 'green' | 'gray'
  desc: Type.Optional(STRING),
  flag: Type.Optional(BOOLEAN),
  marker: Type.Optional(BOOLEAN),
  percent: Type.Optional(NUMBER),
  detail: Type.Optional(STRING),
} satisfies Record<keyof AnalyzedIngredient, TSchema>;

const IngredientSchema = Type.Object(ingredientProperties);

/**
 * `required` SOLO en el nivel superior, y sin `aiEnriched` (es opcional en el
 * tipo). fast-json-stringify LANZA si falta un campo requerido, así que la
 * lista es exactamente lo que `mapRawToProduct` produce siempre: un payload al
 * que le falte algo de esto está roto y es mejor un 500 ruidoso que un
 * producto a medias que el cliente no sabe renderizar.
 *
 * Los objetos anidados van SIN `required` a propósito (todos sus campos son
 * `Type.Optional`), para acotar el radio de explosión: que un campo nuevo del
 * motor se omita no debería tumbar la respuesta entera.
 */
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
  noScore: Nullable(
    Type.Object({ code: Type.Optional(STRING), message: Type.Optional(STRING) }),
  ),

  flagged: BOOLEAN,
  emoji: STRING,
  bgColor: STRING,
  imageUrl: NULLABLE_STRING,
  // `readonly` en el tipo, como `FitogenixProduct.ingredients`; el JSON Schema
  // es el mismo `{ type: 'array', items }`.
  ingredients: Type.Unsafe<ReadonlyArray<Static<typeof IngredientSchema>>>(
    Type.Array(IngredientSchema),
  ),
  nutrition: Type.Object(nutritionProperties),
  dataSource: STRING, // off | obf | edamam | ai
  aiEnriched: Type.Optional(BOOLEAN),
  productId: STRING, // uuid de products.id — con esto el cliente guarda/quita
  scoreLabel: STRING,
  scoreColor: STRING,
  tagline: STRING,
  fito: STRING, // 'fito' | 'nofito' | 'none'
} satisfies Record<keyof FitogenixProduct, TSchema>;

/** El producto que responden el lookup y los listados de user-library. */
export const ProductSchema = Type.Object(productProperties, { $id: 'Product' });

export const lookupBodySchema = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 200 }),
});

export const lookupResponseSchema = {
  200: Type.Ref(ProductSchema),
  404: Type.Ref(ApiErrorSchema),
};
