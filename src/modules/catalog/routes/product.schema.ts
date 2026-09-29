/**
 * Contrato del producto en TypeBox: `ProductSummary` (cada ítem de guardados
 * e historial) y `ProductDetail` (lookup y `GET /v1/products/:id`). K-04,
 * 03-contratos §B.3.1 y §B.3.2.
 *
 * ── DESDE K-01 (ADR-0011) ──
 * Estos schemas son los que Fastify usa para validar y serializar, y de acá
 * sale `contract/openapi.json` (`npm run contract:generate`; el CI falla si el
 * archivo commiteado no coincide). Los tipos viven en
 * application/productResponse.ts (application no puede importar routes) y
 * quedan atados a estos schemas en compilación con `SameShape`: si al tipo le
 * sobra, le falta o le cambia un campo, `tsc` no compila.
 *
 * ── ESPEJO DEL CLIENTE ──
 * native genera sus tipos desde el OpenAPI (K-05). El cliente NO recalcula
 * scoring: solo renderiza estos campos (`scoreLabel`, `scoreColor`, `fito` y
 * `highlight` ya vienen derivados del servidor, ADR-0003).
 *
 * ── Por qué schema de respuesta y no solo un tipo de TypeScript ──
 * 1. El contrato queda EXPLÍCITO: antes el cliente dependía de "lo que el
 *    servidor haya devuelto ese día", que es justamente lo que se rompió al
 *    pasar de v2 a v2.1 del motor.
 * 2. fast-json-stringify serializa bastante más rápido que el JSON.stringify
 *    genérico de Fastify.
 * 3. Es un FILTRO: toda propiedad que no esté declarada acá se ELIMINA de la
 *    respuesta, en silencio. Eso es una garantía (nunca se filtra un campo
 *    interno) y un riesgo (un campo nuevo no declarado desaparece): por eso
 *    `SameShape`.
 *
 * ── `required` en todos los niveles ──
 * fast-json-stringify LANZA si falta un campo requerido: un producto al que le
 * falte algo está roto, y es mejor un 500 ruidoso que un producto a medias que
 * el cliente no sabe renderizar. Desde K-04 los objetos anidados (`noScore`,
 * cada ingrediente, `nutrition`) también declaran todos sus campos, así native
 * no tiene que tratar cada uno como opcional.
 *
 * ── Enums ──
 * `sev`, `noScore.code`, `fito` y `highlight` son `enum` (`StringEnum`, que
 * exige la unión completa del motor). `scoreLabel` se arma desde
 * `scoring.scoringBands()`, así no se transcribe ningún corte ni label. El
 * serializador no valida enums (un valor nuevo no da 500); los tests de
 * contrato validan cada respuesta contra el OpenAPI.
 *
 * ── Nota sobre `null` ──
 * `score`, `noScore`, `brand`, `imageUrl` y cada campo de `nutrition` son
 * legítimamente nulos. Se declaran como `type: ['<tipo>', 'null']`:
 * fast-json-stringify los emite como `null`, NO los coerciona a 0 ni los
 * omite. Un `score: null` significa "el motor decidió no puntuar" (§1), no
 * "puntaje cero".
 */

import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { Nullable, StringEnum, type SameShape } from '../../../platform/http/schemas';
import {
  scoringBands,
  type Fito,
  type Highlight,
  type NoScoreCode,
  type NutritionFacts,
  type Severity,
} from '../../scoring';
import type { ProductDetail, ProductSummary } from '../application/productResponse';

const STRING = Type.String();
const NULLABLE_STRING = Nullable(Type.String());
const NULLABLE_NUMBER = Nullable(Type.Number());

/** Los labels de las bandas, del motor: 'EXCELENTE' … 'SIN DATOS SUFICIENTES'. */
function scoreLabels(): string[] {
  const { bands, noData } = scoringBands();
  return [...bands.map((band) => band.label), noData.label];
}

const summaryProperties = {
  id: Type.String({ format: 'uuid' }),
  name: STRING,
  brand: NULLABLE_STRING,
  imageUrl: NULLABLE_STRING,
  // `null` = el motor NO puntúa este producto (§1). Nunca 0, nunca un valor
  // conservador: "la ausencia de datos nunca mejora un puntaje".
  score: NULLABLE_NUMBER,
  scoreLabel: Type.Unsafe<string>({ type: 'string', enum: scoreLabels() }),
  scoreColor: STRING,
};

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
} satisfies Record<keyof NutritionFacts, TSchema>;

const SeveritySchema = StringEnum<Severity>({
  red: true, orange: true, yellow: true, green: true, gray: true,
});

const NoScoreCodeSchema = StringEnum<NoScoreCode>({
  'fuera-de-alcance': true,
  'no-alimentario': true,
  'sin-ingredientes': true,
  'solo-categorias': true,
  'sin-identificar': true,
  'solo-certificaciones': true,
});

/** El producto en un listado (guardados, historial). */
export const ProductSummarySchema = Type.Object(summaryProperties, { $id: 'ProductSummary' });

/** El producto entero: lo que responden el lookup y `GET /v1/products/:id`. */
export const ProductDetailSchema = Type.Object(
  {
    ...summaryProperties,
    noScore: Nullable(Type.Object({ code: NoScoreCodeSchema, message: STRING })),
    fito: StringEnum<Fito>({ fito: true, nofito: true, none: true }),
    highlight: StringEnum<Highlight>({ cuestionables: true, beneficiosos: true, ninguno: true }),
    // §7 — en el orden de la etiqueta, con su severidad y el porqué.
    ingredients: Type.Array(Type.Object({ name: STRING, sev: SeveritySchema, desc: STRING })),
    nutrition: Type.Object(nutritionProperties),
  },
  { $id: 'ProductDetail' },
);

// Tipos y schemas atados en compilación (ver arriba).
true satisfies SameShape<Static<typeof ProductSummarySchema>, ProductSummary>;
true satisfies SameShape<Static<typeof ProductDetailSchema>, ProductDetail>;
