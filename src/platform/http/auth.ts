// requireAuth: valida el JWT con Supabase `getUser()` y deja `request.userId`. Se registra
// en un sub-contexto; las rutas públicas van afuera.

import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin } from '../supabase';
import { apiError } from './errors';

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
      return reply.status(401).send(apiError('UNAUTHENTICATED', 'Falta el token de sesión'));
    }

    const { data, error } = await supabaseAdmin().auth.getUser(token);

    if (error || !data.user) {
      return reply.status(401).send(apiError('UNAUTHENTICATED', 'Sesión inválida o expirada'));
    }

    request.userId = data.user.id;
  });
};

// fastify-plugin unwraps the plugin so the decorator is visible to parent scope.
export const requireAuth = fp(authPlugin, {
  name: 'fitogenix-auth',
  fastify: '5.x',
});

/** userId desde un access token, o null si es inválido o venció (sin loguear: en el lookup
 *  es normal y degrada a anónimo). H-02 lo reemplaza por `optionalAuth`. */
export async function resolveUserIdFromToken(token: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
