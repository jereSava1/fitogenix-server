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

  // Guardar un producto por su productId (uuid de `products`, viene en el
  // payload del lookup). Idempotente: re-guardar algo ya guardado responde
  // { ok: true } igual. `format: 'uuid'` lo valida ajv (Fastify 5 trae
  // ajv-formats vía @fastify/ajv-compiler).
  app.post<{ Body: { productId: string } }>('/users/me/saved', {
    schema: {
      body: {
        type: 'object',
        required: ['productId'],
        properties: {
          productId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const result = await saveProduct(request.userId, request.body.productId);
      if (result === 'not_found') {
        return reply.status(404).send({ error: 'Producto no encontrado en el catálogo' });
      }
      return reply.send({ ok: true });
    } catch (err) {
      app.log.error(err, 'Error al guardar producto');
      return reply.status(500).send({ error: 'No se pudo guardar el producto' });
    }
  });

  // Quitar un guardado por productId. Idempotente.
  app.delete<{ Params: { productId: string } }>(
    '/users/me/saved/:productId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['productId'],
          properties: {
            productId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        await removeSavedProduct(request.userId, request.params.productId);
        return reply.send({ ok: true });
      } catch (err) {
        app.log.error(err, 'Error al quitar producto guardado');
        return reply.status(500).send({ error: 'No se pudo quitar el producto guardado' });
      }
    },
  );
}
