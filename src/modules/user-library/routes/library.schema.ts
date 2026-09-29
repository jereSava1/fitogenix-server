/* Contrato de las rutas de user-library en TypeBox (ADR-0011, K-01).
 *
 * Los schemas de request son los mismos que se escribían a mano antes de
 * K-01. Los de respuesta son nuevos (antes estas rutas no tenían y Fastify
 * serializaba con JSON.stringify): describen exactamente lo que ya se
 * respondía. El 500 se declara con sus dos formas actuales (InternalError);
 * el 400 de validación y el 429 del rate limit se documentan en K-03, con el
 * formato único: hasta entonces no se declaran, para no cambiar cómo se
 * serializan.
 */

import { Type } from '@sinclair/typebox';
import { ApiErrorSchema, InternalErrorSchema, OkSchema } from '../../../platform/http/schemas';
import { ProductSchema } from '../../catalog';

const ProductIdSchema = Type.String({ format: 'uuid' });
const Unauthorized = Type.Ref(ApiErrorSchema);
const Internal = Type.Ref(InternalErrorSchema);

/** Lista de productos: `{ items }`, cada uno con la misma forma que el lookup. */
const ItemsSchema = Type.Object({ items: Type.Array(Type.Ref(ProductSchema)) });

export const listSavedSchema = {
  tags: ['user-library'],
  summary: 'Listar los guardados del usuario, más reciente primero',
  security: [{ bearerAuth: [] }],
  response: { 200: ItemsSchema, 401: Unauthorized, 500: Internal },
};

export const saveProductSchema = {
  tags: ['user-library'],
  summary: 'Guardar un producto (idempotente)',
  security: [{ bearerAuth: [] }],
  body: Type.Object({ productId: ProductIdSchema }),
  response: { 200: Type.Ref(OkSchema), 401: Unauthorized, 404: Type.Ref(ApiErrorSchema), 500: Internal },
};

export const removeSavedSchema = {
  tags: ['user-library'],
  summary: 'Quitar un producto de los guardados (idempotente)',
  security: [{ bearerAuth: [] }],
  params: Type.Object({ productId: ProductIdSchema }),
  response: { 200: Type.Ref(OkSchema), 401: Unauthorized, 500: Internal },
};

export const listHistorySchema = {
  tags: ['user-library'],
  summary: 'Listar el historial de escaneos, más reciente primero',
  security: [{ bearerAuth: [] }],
  querystring: Type.Object({ limit: Type.Optional(Type.Integer({ default: 20 })) }),
  response: { 200: ItemsSchema, 401: Unauthorized, 500: Internal },
};

/** Los schemas con `$id` que usan estas rutas. */
export const librarySharedSchemas = [ApiErrorSchema, InternalErrorSchema, OkSchema, ProductSchema];
