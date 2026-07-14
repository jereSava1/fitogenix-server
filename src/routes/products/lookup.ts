import type { FastifyInstance } from 'fastify';
import { lookupProduct } from '../../services/productLookupService';
import { recordScan, resolveUserIdFromToken } from '../../services/scanHistoryService';

export async function productLookupRoute(app: FastifyInstance) {
  // Sin requireAuth a propósito: los anónimos también pueden buscar. Si la
  // request trae un Bearer token válido, el escaneo se registra en el
  // historial del usuario en background (ver abajo).
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

    // Registro del escaneo fire-and-forget: sin await, la respuesta HTTP no
    // espera nada de esto y ningún error acá la rompe (recordScan no lanza y
    // el catch cubre cualquier imprevisto).
    const authHeader = request.headers.authorization ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token && product.cacheKey) {
      const cacheKey = product.cacheKey;
      void (async () => {
        const userId = await resolveUserIdFromToken(token);
        if (userId) await recordScan(userId, cacheKey);
      })().catch((err: unknown) => {
        app.log.error(err, 'Error al registrar escaneo en el historial');
      });
    }

    return reply.send(product);
  });
}
