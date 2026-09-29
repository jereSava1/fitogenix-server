/**
 * Contrato de POST /v1/products/lookup, en TypeBox (ADR-0011). El producto
 * que responde (`ProductDetail`) está en product.schema.ts.
 *
 * El body rechaza los campos que no declara (`additionalProperties: false`,
 * D-70): antes Fastify los borraba en silencio y el cliente no se enteraba de
 * que mandaba algo que nadie leía.
 */

import { Type } from '@sinclair/typebox';
import { errorResponses } from '../../../platform/http/schemas';
import { ProductDetailSchema } from './product.schema';

export const lookupBodySchema = Type.Object(
  { query: Type.String({ minLength: 1, maxLength: 200 }) },
  { additionalProperties: false },
);

/** 404 = `PRODUCT_NOT_IN_CATALOG`; 400, 429 y 500 los arma el manejador de
 *  errores (platform/http/errors.ts). */
export const lookupResponseSchema = {
  200: Type.Ref(ProductDetailSchema),
  ...errorResponses(400, 404, 429, 500),
};
