import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../plugins/auth';
import { lookupProduct } from '../../services/productLookupService';

export async function productLookupRoute(app: FastifyInstance) {
  await app.register(requireAuth);

  app.post<{ Body: { query: string } }>('/products/lookup', {
    schema: {
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { query } = request.body;

    const product = await lookupProduct(query.trim());

    if (!product) {
      return reply.status(404).send({ error: 'Producto no encontrado' });
    }

    return reply.send(product);
  });
}
