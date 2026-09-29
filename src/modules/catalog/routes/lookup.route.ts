import type { FastifyPluginAsync } from 'fastify';
import type { LookupProduct } from '../application/lookupProduct';
import { lookupResponseSchema } from './lookup.schema';

/**
 * Registro del escaneo, inyectado desde `main.ts` (docs/02-arquitectura.md
 * §3.3): catalog no conoce a user-library. Recibe el token tal cual llegó en
 * el header porque hoy el usuario se resuelve aparte, en segundo plano
 * (`resolveUserIdFromToken`); con `optionalAuth` (H-02) pasa a recibir el
 * `userId` ya validado.
 */
export type OnScan = (scan: { token: string; productId: string }) => Promise<void>;

export function lookupRoutes(deps: {
  lookup: LookupProduct;
  onScan?: OnScan;
}): FastifyPluginAsync {
  const { lookup, onScan } = deps;

  return async (app) => {
    // Sin requireAuth a propósito: los anónimos también pueden buscar. Si la
    // request trae un Bearer token, el escaneo se registra en el historial del
    // usuario en background (ver abajo).
    app.post<{ Body: { query: string } }>('/products/lookup', {
      schema: {
        body: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
        // Contrato de respuesta EXPLÍCITO (ver lookup.schema.ts). Fastify lo
        // usa para serializar con fast-json-stringify; la contracara es que
        // todo campo no declarado se elimina de la respuesta, así que el
        // schema está atado a `FitogenixProduct` en tiempo de compilación.
        // La fuente de verdad del contrato es el tipo `FitogenixProduct`
        // (application/productResponse.ts); el espejo
        // del cliente vive en fitogenix-native/src/lib/contracts/.
        response: lookupResponseSchema,
      },
    }, async (request, reply) => {
      const { query } = request.body;

      const product = await lookup(query.trim());

      // Sin cascada externa (decisión de producto, 2026-08-18): el lookup solo
      // mira Redis/Supabase. Un `null` acá significa "todavía no está en el
      // catálogo", no "no se pudo resolver por ningún medio" — el mensaje lo
      // refleja.
      if (!product) {
        return reply.status(404).send({
          error: 'Todavía no tenemos este producto en nuestro catálogo.',
        });
      }

      // Registro del escaneo fire-and-forget: sin await, la respuesta HTTP no
      // espera nada de esto y ningún error acá la rompe (el catch cubre
      // cualquier imprevisto). El lookup solo lee del catálogo, así que el
      // producto que devuelve ya existe en `products` y su productId sirve
      // como FK del historial.
      const authHeader = request.headers.authorization ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (onScan && token && product.productId) {
        const productId = product.productId;
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
