// Rutas de user-library. Los listados llevan el resumen más la fecha de la fila; el body
// de POST y el querystring del historial rechazan campos de más (D-70).

import { Type, type Static } from '@sinclair/typebox';
import {
  ApiErrorSchema,
  errorResponses,
  OkSchema,
  type SameShape,
} from '../../../platform/http/schemas';
import { ProductSummarySchema } from '../../catalog';
import type { HistoryItem } from '../application/history';
import type { SavedItem } from '../application/saved';

const ProductIdSchema = Type.String({ format: 'uuid' });
const DATE_TIME = Type.String({ format: 'date-time' });

/** Un guardado: el resumen del producto y cuándo se guardó. */
export const SavedItemSchema = Type.Composite(
  [ProductSummarySchema, Type.Object({ savedAt: DATE_TIME })],
  { $id: 'SavedItem' },
);

/** Un escaneo: el resumen del producto y cuándo se escaneó por última vez. */
export const HistoryItemSchema = Type.Composite(
  [ProductSummarySchema, Type.Object({ scannedAt: DATE_TIME })],
  { $id: 'HistoryItem' },
);

true satisfies SameShape<Static<typeof SavedItemSchema>, SavedItem>;
true satisfies SameShape<Static<typeof HistoryItemSchema>, HistoryItem>;

export const listSavedSchema = {
  tags: ['user-library'],
  summary: 'Listar los guardados del usuario, más reciente primero',
  security: [{ bearerAuth: [] }],
  response: {
    200: Type.Object({ items: Type.Array(Type.Ref(SavedItemSchema)) }),
    ...errorResponses(401, 429, 500, 503),
  },
};

export const saveProductSchema = {
  tags: ['user-library'],
  summary: 'Guardar un producto (idempotente)',
  security: [{ bearerAuth: [] }],
  body: Type.Object({ productId: ProductIdSchema }, { additionalProperties: false }),
  response: { 200: Type.Ref(OkSchema), ...errorResponses(400, 401, 404, 429, 500, 503) },
};

export const removeSavedSchema = {
  tags: ['user-library'],
  summary: 'Quitar un producto de los guardados (idempotente)',
  security: [{ bearerAuth: [] }],
  params: Type.Object({ productId: ProductIdSchema }),
  response: { 200: Type.Ref(OkSchema), ...errorResponses(400, 401, 429, 500, 503) },
};

export const listHistorySchema = {
  tags: ['user-library'],
  summary: 'Listar el historial de escaneos, más reciente primero',
  security: [{ bearerAuth: [] }],
  querystring: Type.Object(
    { limit: Type.Optional(Type.Integer({ default: 20 })) },
    { additionalProperties: false },
  ),
  response: {
    200: Type.Object({ items: Type.Array(Type.Ref(HistoryItemSchema)) }),
    ...errorResponses(400, 401, 429, 500, 503),
  },
};

/** Los schemas con `$id` que usan estas rutas. */
export const librarySharedSchemas = [ApiErrorSchema, OkSchema, SavedItemSchema, HistoryItemSchema];
