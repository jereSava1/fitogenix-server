/**
 * Fitogenix auth plugin — JWT validation via Supabase getUser().
 *
 * Usage: register this plugin on a scoped Fastify sub-instance, then every
 * handler underneath it has access to `request.userId: string`.
 *
 * Public routes (health, GET /products/image) must NOT be registered under
 * this plugin — register them directly on the root app.
 */

import { createClient } from '@supabase/supabase-js';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';

// Extend FastifyRequest so TypeScript knows about `userId`.
declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

// Lazily-created singleton — avoids reconnecting on every request.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: ReturnType<typeof createClient<any>> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminClient = (): ReturnType<typeof createClient<any>> => {
  if (!_adminClient) {
    _adminClient = createClient(config.supabaseUrl, config.supabaseSecretKey);
  }
  return _adminClient;
};

const authPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return reply.status(401).send({ error: 'Falta el token de sesión' });
    }

    const { data, error } = await adminClient().auth.getUser(token);

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
