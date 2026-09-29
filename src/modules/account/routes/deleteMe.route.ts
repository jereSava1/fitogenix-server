/**
 * DELETE /users/me: elimina la cuenta del usuario del token (RF-029). Bajo
 * requireAuth: `request.userId` viene del JWT de Supabase, nunca del cliente.
 * El caso de uso se inyecta desde el index del módulo (M-07).
 */

import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../../../platform/http/auth';
import {
  addSharedSchemas,
  ApiErrorSchema,
  InternalErrorSchema,
  OkSchema,
} from '../../../platform/http/schemas';
import type { DeleteAccount } from '../application/deleteAccount';
import { DeleteUserError } from '../application/ports';

/** Contrato (ADR-0011, K-01). El 500 lleva sus dos formas actuales
 *  (InternalError): `{ error }` del handler o el genérico de Fastify si el
 *  cliente de Supabase lanza (caracterizado en M-07). */
const deleteMeSchema = {
  tags: ['account'],
  summary: 'Eliminar la cuenta del usuario',
  security: [{ bearerAuth: [] }],
  response: {
    200: Type.Ref(OkSchema),
    401: Type.Ref(ApiErrorSchema),
    500: Type.Ref(InternalErrorSchema),
  },
};

export const accountSharedSchemas = [ApiErrorSchema, InternalErrorSchema, OkSchema];

export const deleteMeRoutes = (deps: { deleteAccount: DeleteAccount }): FastifyPluginAsync =>
  async (instance) => {
    addSharedSchemas(instance, accountSharedSchemas);
    const app = instance.withTypeProvider<TypeBoxTypeProvider>();
    await app.register(requireAuth);

    app.delete('/users/me', { schema: deleteMeSchema }, async (request, reply) => {
      try {
        await deps.deleteAccount(request.userId);
      } catch (err) {
        if (!(err instanceof DeleteUserError)) throw err;
        app.log.error('Error al eliminar cuenta: %s', err.message);
        return reply.status(500).send({ error: 'No se pudo eliminar la cuenta' });
      }

      return reply.send({ ok: true });
    });
  };
