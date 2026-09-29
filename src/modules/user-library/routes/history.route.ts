// Historial del usuario. `request.userId` sale del JWT (requireAuth).

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../../../platform/http/auth';
import { DependencyUnavailableError } from '../../../platform/dependencyError';
import { apiError } from '../../../platform/http/errors';
import { addSharedSchemas } from '../../../platform/http/schemas';
import type { ScanHistory } from '../application/history';
import { librarySharedSchemas, listHistorySchema } from './library.schema';

export const historyRoutes = (deps: { history: ScanHistory }): FastifyPluginAsync => async (instance) => {
  const { listScanHistory } = deps.history;
  addSharedSchemas(instance, librarySharedSchemas);
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  await app.register(requireAuth);

  // Historial de escaneos, más reciente primero. `limit` opcional (default 20);
  // el schema coerciona a entero y el handler lo clampa a [1, 50] en vez de
  // rechazar con 400 valores fuera de rango.
  app.get('/users/me/history', { schema: listHistorySchema }, async (request, reply) => {
    const limit = Math.min(50, Math.max(1, request.query.limit ?? 20));
    try {
      const items = await listScanHistory(request.userId, limit);
      return reply.send({ items });
    } catch (err) {
      if (err instanceof DependencyUnavailableError) throw err; // 503
      app.log.error(err, 'Error al listar el historial de escaneos');
      return reply.status(500).send(apiError('INTERNAL', 'No se pudo obtener el historial'));
    }
  });
};
