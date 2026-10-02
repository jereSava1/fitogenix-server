// Guardados del usuario. `request.userId` sale del JWT (requireAuth).

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../../../platform/http/auth';
import { DependencyUnavailableError } from '../../../platform/dependencyError';
import { apiError } from '../../../platform/http/errors';
import { addSharedSchemas } from '../../../platform/http/schemas';
import type { SavedProducts } from '../application/saved';
import {
  librarySharedSchemas,
  listSavedSchema,
  removeSavedSchema,
  saveProductSchema,
} from './library.schema';

export const savedRoutes = (deps: { saved: SavedProducts }): FastifyPluginAsync => async (instance) => {
  const { listSavedProducts, removeSavedProduct, saveProduct } = deps.saved;
  addSharedSchemas(instance, librarySharedSchemas);
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  await app.register(requireAuth);

  // Listado de guardados, más reciente primero.
  app.get('/users/me/saved', { schema: listSavedSchema }, async (request, reply) => {
    try {
      const items = await listSavedProducts(request.userId);
      return reply.send({ items });
    } catch (err) {
      if (err instanceof DependencyUnavailableError) throw err; // 503
      app.log.error(err, 'Error al listar productos guardados');
      return reply.status(500).send(apiError('INTERNAL', 'No se pudieron obtener los guardados'));
    }
  });

  // Idempotente. El uuid lo valida ajv (`format: 'uuid'`).
  app.post('/users/me/saved', { schema: saveProductSchema }, async (request, reply) => {
    try {
      const result = await saveProduct(request.userId, request.body.productId);
      if (result === 'not_found') {
        return reply.status(404).send(apiError('NOT_FOUND', 'Producto no encontrado en el catálogo'));
      }
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof DependencyUnavailableError) throw err; // 503
      app.log.error(err, 'Error al guardar producto');
      return reply.status(500).send(apiError('INTERNAL', 'No se pudo guardar el producto'));
    }
  });

  // Quitar un guardado por productId. Idempotente.
  app.delete(
    '/users/me/saved/:productId',
    { schema: removeSavedSchema },
    async (request, reply) => {
      try {
        await removeSavedProduct(request.userId, request.params.productId);
        return reply.send({ ok: true });
      } catch (err) {
        if (err instanceof DependencyUnavailableError) throw err; // 503
        app.log.error(err, 'Error al quitar producto guardado');
        return reply.status(500).send(apiError('INTERNAL', 'No se pudo quitar el producto guardado'));
      }
    },
  );
};
