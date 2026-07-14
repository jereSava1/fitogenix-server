/**
 * Ruta de historial de escaneos por usuario. Bajo requireAuth (mismo patrón
 * que saved.ts): `request.userId` viene del JWT de Supabase. La lógica vive
 * en scanHistoryService para poder testearla sin Fastify.
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../plugins/auth';
import { listScanHistory } from '../../services/scanHistoryService';

export async function scanHistoryRoutes(app: FastifyInstance) {
  await app.register(requireAuth);

  // Historial de escaneos, más reciente primero. `limit` opcional (default 20);
  // el schema coerciona a entero y el handler lo clampa a [1, 50] en vez de
  // rechazar con 400 valores fuera de rango.
  app.get<{ Querystring: { limit?: number } }>('/users/me/history', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const limit = Math.min(50, Math.max(1, request.query.limit ?? 20));
    try {
      const items = await listScanHistory(request.userId, limit);
      return reply.send({ items });
    } catch (err) {
      app.log.error(err, 'Error al listar el historial de escaneos');
      return reply.status(500).send({ error: 'No se pudo obtener el historial' });
    }
  });
}
