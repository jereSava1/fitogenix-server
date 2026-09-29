/* Contrato de las rutas de user-library en TypeBox (ADR-0011, K-01).
 *
 * Los schemas de request son los mismos que se escribían a mano antes de
 * K-01. Los de respuesta describen exactamente lo que se responde. Todos los
 * errores son `ApiError` (`{ error, code }`, K-03): 401 lo responde
 * requireAuth, 404 y 500 los handlers, y 400, 429 y los 500 no atrapados el
 * manejador de errores (platform/http/errors.ts).
 */

import { Type } from '@sinclair/typebox';
import { ApiErrorSchema, errorResponses, OkSchema } from '../../../platform/http/schemas';
import { ProductSchema } from '../../catalog';

const ProductIdSchema = Type.String({ format: 'uuid' });

/** Lista de productos: `{ items }`, cada uno con la misma forma que el lookup. */
const ItemsSchema = Type.Object({ items: Type.Array(Type.Ref(ProductSchema)) });

export const listSavedSchema = {
  tags: ['user-library'],
  summary: 'Listar los guardados del usuario, más reciente primero',
  security: [{ bearerAuth: [] }],
  response: { 200: ItemsSchema, ...errorResponses(401, 429, 500) },
};

export const saveProductSchema = {
  tags: ['user-library'],
  summary: 'Guardar un producto (idempotente)',
  security: [{ bearerAuth: [] }],
  body: Type.Object({ productId: ProductIdSchema }),
  response: { 200: Type.Ref(OkSchema), ...errorResponses(400, 401, 404, 429, 500) },
};

export const removeSavedSchema = {
  tags: ['user-library'],
  summary: 'Quitar un producto de los guardados (idempotente)',
  security: [{ bearerAuth: [] }],
  params: Type.Object({ productId: ProductIdSchema }),
  response: { 200: Type.Ref(OkSchema), ...errorResponses(400, 401, 429, 500) },
};

export const listHistorySchema = {
  tags: ['user-library'],
  summary: 'Listar el historial de escaneos, más reciente primero',
  security: [{ bearerAuth: [] }],
  querystring: Type.Object({ limit: Type.Optional(Type.Integer({ default: 20 })) }),
  response: { 200: ItemsSchema, ...errorResponses(400, 401, 429, 500) },
};

/** Los schemas con `$id` que usan estas rutas. */
export const librarySharedSchemas = [ApiErrorSchema, OkSchema, ProductSchema];
