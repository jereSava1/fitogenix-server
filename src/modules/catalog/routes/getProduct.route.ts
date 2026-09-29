/**
 * `GET /v1/products/:id`: el detalle de un producto por su uuid (K-04,
 * 03-contratos §B.3.2). Lo pide la app al abrir un guardado o un ítem del
 * historial, que llegan como `ProductSummary`.
 *
 * Sin requireAuth, como el lookup: el catálogo es público. A diferencia del
 * lookup, NO registra el escaneo: abrir algo de la lista no es escanearlo.
 */

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import { apiError } from '../../../platform/http/errors';
import { addSharedSchemas, ApiErrorSchema, errorResponses } from '../../../platform/http/schemas';
import type { GetProduct } from '../application/getProduct';
import { ProductDetailSchema } from './product.schema';

const getProductSchema = {
  tags: ['catalog'],
  summary: 'Detalle de un producto por su id',
  params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
  response: {
    200: Type.Ref(ProductDetailSchema),
    ...errorResponses(400, 404, 429, 500),
  },
};

export function productRoutes(deps: { getProduct: GetProduct }): FastifyPluginAsync {
  const { getProduct } = deps;

  return async (instance) => {
    addSharedSchemas(instance, [ApiErrorSchema, ProductDetailSchema]);
    const app = instance.withTypeProvider<TypeBoxTypeProvider>();

    app.get('/products/:id', { schema: getProductSchema }, async (request, reply) => {
      const product = await getProduct(request.params.id);
      if (!product) {
        return reply.status(404).send(apiError('NOT_FOUND', 'Producto no encontrado en el catálogo'));
      }
      return reply.send(product);
    });
  };
}
