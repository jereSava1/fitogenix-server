/**
 * Rutas de productos guardados por usuario (favoritos). Todas bajo requireAuth
 * (mismo patrón que deleteMe.ts): `request.userId` viene del JWT de Supabase.
 * La lógica vive en savedProductsService para poder testearla sin Fastify.
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../plugins/auth';
import {
  listSavedProducts,
  removeSavedProduct,
  saveProduct,
} from '../../services/savedProductsService';

export async function savedProductsRoutes(app: FastifyInstance) {
  await app.register(requireAuth);

  // Listado de guardados, más reciente primero.
  app.get('/users/me/saved', async (request, reply) => {
    try {
      const items = await listSavedProducts(request.userId);
      return reply.send({ items });
    } catch (err) {
      app.log.error(err, 'Error al listar productos guardados');
      return reply.status(500).send({ error: 'No se pudieron obtener los guardados' });
    }
  });

  // Guardar un producto por su cacheKey (viene en el payload del lookup).
  // Idempotente: re-guardar algo ya guardado responde { ok: true } igual.
  app.post<{ Body: { cacheKey: string } }>('/users/me/saved', {
    schema: {
      body: {
        type: 'object',
        required: ['cacheKey'],
        properties: {
          cacheKey: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const result = await saveProduct(request.userId, request.body.cacheKey);
      if (result === 'not_found') {
        return reply.status(404).send({ error: 'Producto no encontrado en el catálogo' });
      }
      return reply.send({ ok: true });
    } catch (err) {
      app.log.error(err, 'Error al guardar producto');
      return reply.status(500).send({ error: 'No se pudo guardar el producto' });
    }
  });

  // Quitar un guardado. El param llega URL-encoded (las claves 'name:<...>'
  // tienen espacios); Fastify lo decodea solo. Idempotente.
  app.delete<{ Params: { cacheKey: string } }>(
    '/users/me/saved/:cacheKey',
    async (request, reply) => {
      try {
        await removeSavedProduct(request.userId, request.params.cacheKey);
        return reply.send({ ok: true });
      } catch (err) {
        app.log.error(err, 'Error al quitar producto guardado');
        return reply.status(500).send({ error: 'No se pudo quitar el producto guardado' });
      }
    },
  );
}
