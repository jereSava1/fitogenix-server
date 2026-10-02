import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { optionalAuth } from '../../../platform/http/auth';
import { apiError } from '../../../platform/http/errors';
import { addSharedSchemas, ApiErrorSchema } from '../../../platform/http/schemas';
import type { LookupProduct } from '../application/lookupProduct';
import { lookupBodySchema, lookupResponseSchema } from './lookup.schema';
import { ProductDetailSchema } from './product.schema';

/** Registro del escaneo, inyectado (catalog no conoce a user-library). Recibe el usuario
 *  ya verificado. */
export type OnScan = (scan: { userId: string; productId: string }) => Promise<void>;

export function lookupRoutes(deps: {
  lookup: LookupProduct;
  onScan?: OnScan;
}): FastifyPluginAsync {
  const { lookup, onScan } = deps;

  return async (instance) => {
    addSharedSchemas(instance, [ApiErrorSchema, ProductDetailSchema]);
    const app = instance.withTypeProvider<TypeBoxTypeProvider>();

    // Sin requireAuth a propósito: los anónimos también pueden buscar. Con una sesión
    // válida, el escaneo se registra en el historial del usuario (ver abajo).
    app.post('/products/lookup', {
      schema: {
        tags: ['catalog'],
        summary: 'Buscar un producto por código de barras o por nombre',
        body: lookupBodySchema,
        // Sin declarar en el schema, un campo no sale en la respuesta (ver product.schema.ts).
        response: lookupResponseSchema,
      },
    }, async (request, reply) => {
      const { query } = request.body;

      const product = await lookup(query.trim());

      // `null` = todavía no está en el catálogo (no hay búsqueda externa).
      if (!product) {
        return reply.status(404).send(
          apiError('PRODUCT_NOT_IN_CATALOG', 'Todavía no tenemos este producto en nuestro catálogo.'),
        );
      }

      // En segundo plano: la respuesta no espera ni la verificación del token ni el registro,
      // y un error ahí no la rompe. Token inválido o vencido → anónimo, sin registrar (D-75).
      if (onScan && product.id) {
        const productId = product.id;
        void (async () => {
          const userId = await optionalAuth(request);
          if (userId) await onScan({ userId, productId });
        })().catch((err: unknown) => {
          app.log.error(err, 'Error al registrar escaneo en el historial');
        });
      }

      return reply.send(product);
    });
  };
}
