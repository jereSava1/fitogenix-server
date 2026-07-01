import { createClient } from '@supabase/supabase-js';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../plugins/auth';
import { config } from '../../config';

export async function deleteUserRoute(app: FastifyInstance) {
  await app.register(requireAuth);

  app.delete('/users/me', async (request, reply) => {
    const admin = createClient(config.supabaseUrl, config.supabaseSecretKey);

    const { error: deleteError } = await admin.auth.admin.deleteUser(request.userId);
    if (deleteError) {
      app.log.error('Error al eliminar cuenta: %s', deleteError.message);
      return reply.status(500).send({ error: 'No se pudo eliminar la cuenta' });
    }

    return reply.send({ ok: true });
  });
}
