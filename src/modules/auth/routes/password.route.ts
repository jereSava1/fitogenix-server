// POST /v1/auth/password/forgot y /reset (RF-025): el código de recuperación por mail y el
// cambio de contraseña, sin que la app toque Supabase (ADR-0010).

import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { apiError } from '../../../platform/http/errors';
import { addSharedSchemas, ApiErrorSchema, errorResponses, OkSchema } from '../../../platform/http/schemas';
import type { PasswordReset } from '../application/resetPassword';
import { AUTH_RATE_LIMIT, Email, Password, sendRateLimited, SUPABASE_RETRY_AFTER_S } from './fields';

// El largo del código lo configura el proyecto de Supabase (6 por defecto, hasta 10).
const Code = Type.String({ pattern: '^[0-9]{6,10}$' });

const INVALID_CODE = apiError('INVALID_CODE', 'El código es inválido o expiró. Pedí uno nuevo.');
const REJECTED_PASSWORD = {
  same_password: 'La contraseña nueva tiene que ser distinta de la anterior.',
  weak_password: 'La contraseña no cumple los requisitos de seguridad.',
} as const;

export const passwordSharedSchemas = [ApiErrorSchema, OkSchema];

export const passwordRoutes = (deps: { passwordReset: PasswordReset }): FastifyPluginAsync =>
  async (instance) => {
    addSharedSchemas(instance, passwordSharedSchemas);
    const app = instance.withTypeProvider<TypeBoxTypeProvider>();

    app.post('/auth/password/forgot', {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Pedir el código para recuperar la contraseña (202 aunque el email no exista)',
        body: Type.Object({ email: Email }, { additionalProperties: false }),
        response: { 202: Type.Ref(OkSchema), ...errorResponses(400, 429, 500, 503) },
      },
    }, async (request, reply) => {
      await deps.passwordReset.forgot(request.body.email, request.ip);
      return reply.status(202).send({ ok: true });
    });

    app.post('/auth/password/reset', {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Cambiar la contraseña con el código recibido por mail',
        body: Type.Object({ email: Email, code: Code, newPassword: Password }, { additionalProperties: false }),
        response: { 200: Type.Ref(OkSchema), ...errorResponses(400, 401, 429, 500, 503) },
      },
    }, async (request, reply) => {
      const { email, code, newPassword } = request.body;
      const result = await deps.passwordReset.reset(email, code, newPassword, request.ip);

      if (result === 'ok') return reply.send({ ok: true });
      if (result === 'invalid_code') return reply.status(401).send(INVALID_CODE);
      if (result === 'same_password' || result === 'weak_password') {
        return reply.status(400).send(apiError('VALIDATION_ERROR', REJECTED_PASSWORD[result]));
      }
      return sendRateLimited(reply, result === 'rate_limited' ? SUPABASE_RETRY_AFTER_S : result.tooManyAttempts);
    });
  };
