/**
 * Fitogenix auth plugin — JWT validation via Supabase getUser().
 *
 * Usage: register this plugin on a scoped Fastify sub-instance, then every
 * handler underneath it has access to `request.userId: string`.
 *
 * Public routes (health, POST /products/lookup) must NOT be registered under
 * this plugin — register them directly on the root app.
 */

import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin } from '../platform/supabase';

// Extend FastifyRequest so TypeScript knows about `userId`.
declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

const authPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return reply.status(401).send({ error: 'Falta el token de sesión' });
    }

    const { data, error } = await supabaseAdmin().auth.getUser(token);

    if (error || !data.user) {
      return reply.status(401).send({ error: 'Sesión inválida o expirada' });
    }

    request.userId = data.user.id;
  });
};

// fastify-plugin unwraps the plugin so the decorator is visible to parent scope.
export const requireAuth = fp(authPlugin, {
  name: 'fitogenix-auth',
  fastify: '5.x',
});
