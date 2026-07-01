import { createClient } from '@supabase/supabase-js';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config';

export async function deleteUserRoute(app: FastifyInstance) {
  app.delete('/users/me', async (request, reply) => {
    const authHeader = request.headers.authorization ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return reply.status(401).send({ error: 'Falta el token de sesión' });
    }

    const admin = createClient(config.supabaseUrl, config.supabaseSecretKey);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
      return reply.status(401).send({ error: 'Sesión inválida o expirada' });
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
    if (deleteError) {
      app.log.error('Error al eliminar cuenta: %s', deleteError.message);
      return reply.status(500).send({ error: 'No se pudo eliminar la cuenta' });
    }

    return reply.send({ ok: true });
  });
}
