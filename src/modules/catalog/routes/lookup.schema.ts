// POST /v1/products/lookup. El body rechaza los campos que no declara (D-70).

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
