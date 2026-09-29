import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { apiError } from '../../../platform/http/errors';
import { addSharedSchemas, ApiErrorSchema } from '../../../platform/http/schemas';
import type { LookupProduct } from '../application/lookupProduct';
import { lookupBodySchema, lookupResponseSchema } from './lookup.schema';
import { ProductDetailSchema } from './product.schema';

/** Registro del escaneo, inyectado (catalog no conoce a user-library). Recibe el token
 *  crudo: el usuario se resuelve aparte, en segundo plano (pasa a `userId` con H-02). */
export type OnScan = (scan: { token: string; productId: string }) => Promise<void>;

export function lookupRoutes(deps: {
  lookup: LookupProduct;
  onScan?: OnScan;
}): FastifyPluginAsync {
  const { lookup, onScan } = deps;

  return async (instance) => {
    addSharedSchemas(instance, [ApiErrorSchema, ProductDetailSchema]);
    const app = instance.withTypeProvider<TypeBoxTypeProvider>();

    // Sin requireAuth a propósito: los anónimos también pueden buscar. Si la
    // request trae un Bearer token, el escaneo se registra en el historial del
    // usuario en background (ver abajo).
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

      // Fire-and-forget: la respuesta no espera el registro y un error ahí no la rompe.
      const authHeader = request.headers.authorization ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (onScan && token && product.id) {
        const productId = product.id;
        void (async () => {
          await onScan({ token, productId });
        })().catch((err: unknown) => {
          app.log.error(err, 'Error al registrar escaneo en el historial');
        });
      }

      return reply.send(product);
    });
  };
}
