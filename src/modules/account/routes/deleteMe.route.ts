// DELETE /v1/users/me: borra la cuenta del usuario del token. Además de verificar el JWT,
// Supabase Auth confirma que la sesión sigue activa (ADR-0008).

import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../../../platform/http/auth';
import { apiError } from '../../../platform/http/errors';
import {
  addSharedSchemas,
  ApiErrorSchema,
  errorResponses,
  OkSchema,
} from '../../../platform/http/schemas';
import type { DeleteAccount } from '../application/deleteAccount';
import { DeleteUserError } from '../application/ports';

/** El 500 es `ApiError` también si el cliente de Supabase lanza; 503 si Auth no responde. */
const deleteMeSchema = {
  tags: ['account'],
  summary: 'Eliminar la cuenta del usuario',
  security: [{ bearerAuth: [] }],
  response: {
    200: Type.Ref(OkSchema),
    ...errorResponses(401, 429, 500, 503),
  },
};

export const accountSharedSchemas = [ApiErrorSchema, OkSchema];

export const deleteMeRoutes = (deps: { deleteAccount: DeleteAccount }): FastifyPluginAsync =>
  async (instance) => {
    addSharedSchemas(instance, accountSharedSchemas);
    const app = instance.withTypeProvider<TypeBoxTypeProvider>();
    await app.register(requireAuth, { checkSession: true });

    app.delete('/users/me', { schema: deleteMeSchema }, async (request, reply) => {
      try {
        await deps.deleteAccount(request.userId);
      } catch (err) {
        if (!(err instanceof DeleteUserError)) throw err;
        app.log.error('Error al eliminar cuenta: %s', err.message);
        return reply.status(500).send(apiError('INTERNAL', 'No se pudo eliminar la cuenta'));
      }

      return reply.send({ ok: true });
    });
  };
