/**
 * `ProductSummary` y `ProductDetail`: validan, serializan y generan el OpenAPI. Todo campo
 * es requerido (falta uno → 500) y lo no declarado se borra; `SameShape` ata los tipos. */

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
import type { NutritionBasis } from '../domain/rawProduct';

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
    // Sobre qué base está `nutrition`; `null` si la fuente no lo dice. Nunca se convierte ml a g.
    nutritionBasis: Type.Unsafe<NutritionBasis | null>({ type: ['string', 'null'], enum: ['100g', '100ml', null] }),
  },
  { $id: 'ProductDetail' },
);

// Tipos y schemas atados en compilación (ver arriba).
true satisfies SameShape<Static<typeof ProductSummarySchema>, ProductSummary>;
true satisfies SameShape<Static<typeof ProductDetailSchema>, ProductDetail>;
