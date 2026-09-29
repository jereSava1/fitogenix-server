/**
 * Rutas de productos guardados por usuario (favoritos). Todas bajo requireAuth
 * (mismo patrón que account/routes/deleteMe.route.ts): `request.userId` viene del JWT de Supabase.
 * Los casos de uso (`application/saved.ts`) se inyectan desde el index del
 * módulo (M-06).
 */

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../../../platform/http/auth';
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
      app.log.error(err, 'Error al listar productos guardados');
      return reply.status(500).send({ error: 'No se pudieron obtener los guardados' });
    }
  });

  // Guardar un producto por su productId (uuid de `products`, viene en el
  // payload del lookup). Idempotente: re-guardar algo ya guardado responde
  // { ok: true } igual. `format: 'uuid'` lo valida ajv (Fastify 5 trae
  // ajv-formats vía @fastify/ajv-compiler).
  app.post('/users/me/saved', { schema: saveProductSchema }, async (request, reply) => {
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
  app.delete(
    '/users/me/saved/:productId',
    { schema: removeSavedSchema },
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
};
