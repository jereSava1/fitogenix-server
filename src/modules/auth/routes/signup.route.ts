// POST /v1/auth/signup y GET /v1/auth/username-availability (RF-020, RF-021), sin que la app
// toque Supabase (ADR-0010).

import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { apiError, RATE_LIMITED_MESSAGE } from '../../../platform/http/errors';
import {
  addSharedSchemas,
  ApiErrorSchema,
  errorResponses,
  PersonName,
  Phone,
  Username,
} from '../../../platform/http/schemas';
import type { SignUp } from '../application/signUp';
import { AUTH_RATE_LIMIT, Email, Password } from './fields';

const REJECTED = {
  email_taken: [409, apiError('EMAIL_TAKEN', 'Ya hay una cuenta con ese email.')],
  username_taken: [409, apiError('USERNAME_TAKEN', 'Ese nombre de usuario ya está en uso.')],
  weak_password: [400, apiError('VALIDATION_ERROR', 'La contraseña no cumple los requisitos de seguridad.')],
  rejected: [400, apiError('VALIDATION_ERROR', 'No se pudo crear la cuenta con esos datos.')],
} as const;

export const signUpSharedSchemas = [ApiErrorSchema];

export const signUpRoutes = (deps: { signUp: SignUp }): FastifyPluginAsync =>
  async (instance) => {
    addSharedSchemas(instance, signUpSharedSchemas);
    const app = instance.withTypeProvider<TypeBoxTypeProvider>();

    app.post('/auth/signup', {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Crear una cuenta con email; queda pendiente de confirmar el email',
        body: Type.Object(
          {
            email: Email,
            password: Password,
            firstName: PersonName(),
            lastName: PersonName(),
            username: Username(),
            phone: Phone(),
          },
          { additionalProperties: false },
        ),
        response: {
          201: Type.Object({ status: Type.Literal('confirmation_required') }),
          ...errorResponses(400, 409, 429, 500, 503),
        },
      },
    }, async (request, reply) => {
      const { email, password, ...profile } = request.body;
      const result = await deps.signUp.signUp(email, password, profile);

      if (result === 'confirmation_required') return reply.status(201).send({ status: result });
      if (result === 'rate_limited') {
        return reply.status(429).header('retry-after', '60').send(apiError('RATE_LIMITED', RATE_LIMITED_MESSAGE));
      }
      const [status, body] = REJECTED[result];
      return reply.status(status).send(body);
    });

    app.get('/auth/username-availability', {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Saber si un nombre de usuario está libre',
        querystring: Type.Object({ username: Username() }, { additionalProperties: false }),
        response: {
          200: Type.Object({ available: Type.Boolean() }),
          ...errorResponses(400, 429, 500, 503),
        },
      },
    }, async (request) => ({
      available: await deps.signUp.isUsernameAvailable(request.query.username),
    }));
  };
