/**
 * DELETE /users/me: elimina la cuenta del usuario del token (RF-029). Bajo
 * requireAuth: `request.userId` viene del JWT de Supabase, nunca del cliente.
 * El caso de uso se inyecta desde el index del módulo (M-07).
 */

import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../../../platform/http/auth';
import type { DeleteAccount } from '../application/deleteAccount';
import { DeleteUserError } from '../application/ports';

export const deleteMeRoutes = (deps: { deleteAccount: DeleteAccount }): FastifyPluginAsync =>
  async (app) => {
    await app.register(requireAuth);

    app.delete('/users/me', async (request, reply) => {
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
