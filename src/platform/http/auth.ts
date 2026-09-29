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
import { supabaseAdmin } from '../supabase';

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

/**
 * Resuelve el userId desde un access token de Supabase. Devuelve null si el
 * token es inválido o expiró — SIN loguear error: un token vencido en un
 * lookup (que degrada a anónimo) es un caso normal, no una falla.
 *
 * Lo usa el registro del escaneo del lookup (el `onScan` de main.ts). Vivía en
 * `services/scanHistoryService.ts`; se mudó acá en M-06 sin cambios. H-02 lo
 * reemplaza por `optionalAuth` (docs/02-arquitectura.md §5.2 #25).
 */
export async function resolveUserIdFromToken(token: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
