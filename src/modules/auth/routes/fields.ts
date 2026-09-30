// Lo que comparten las rutas de /auth/*.

import { Type } from '@sinclair/typebox';
import type { FastifyReply } from 'fastify';
import { apiError, RATE_LIMITED_MESSAGE } from '../../../platform/http/errors';

/** D-48: `/auth/*` con 10 pedidos por minuto por IP (el general es 60). */
export const AUTH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

/** Cuando el límite es de Supabase no se sabe cuánto falta: se sugiere un minuto. */
export const SUPABASE_RETRY_AFTER_S = 60;

export const Email = Type.String({ format: 'email', maxLength: 254 });
export const Password = Type.String({ minLength: 8, maxLength: 72 });

export function sendRateLimited(reply: FastifyReply, retryAfterS: number) {
  return reply
    .status(429)
    .header('retry-after', String(retryAfterS))
    .send(apiError('RATE_LIMITED', RATE_LIMITED_MESSAGE));
}
