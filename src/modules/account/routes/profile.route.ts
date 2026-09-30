// GET y PATCH /v1/users/me/profile: los datos personales del usuario del token (RF-028).

import { Type, type Static } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../../../platform/http/auth';
import { apiError } from '../../../platform/http/errors';
import {
  addSharedSchemas,
  ApiErrorSchema,
  errorResponses,
  Nullable,
  PersonName,
  Phone,
  type SameShape,
  Username,
} from '../../../platform/http/schemas';
import type { Profile, ProfileChanges } from '../application/ports';
import type { ProfileService } from '../application/profile';

export const ProfileSchema = Type.Object(
  {
    firstName: Nullable(Type.String()),
    lastName: Nullable(Type.String()),
    username: Nullable(Type.String()),
    phone: Nullable(Type.String()),
  },
  { $id: 'Profile' },
);
true satisfies SameShape<Static<typeof ProfileSchema>, Profile>;

// Las reglas del registro, para los campos que se mandan.
const ProfileChangesSchema = Type.Object(
  {
    firstName: Type.Optional(PersonName()),
    lastName: Type.Optional(PersonName()),
    username: Type.Optional(Username()),
    phone: Type.Optional(Phone()),
  },
  { additionalProperties: false, minProperties: 1 },
);
true satisfies SameShape<Static<typeof ProfileChangesSchema>, ProfileChanges>;

const NOT_FOUND = apiError('NOT_FOUND', 'Todavía no completaste tus datos personales');

export const profileSharedSchemas = [ApiErrorSchema, ProfileSchema];

export const profileRoutes = (deps: { profile: ProfileService }): FastifyPluginAsync =>
  async (instance) => {
    addSharedSchemas(instance, profileSharedSchemas);
    const app = instance.withTypeProvider<TypeBoxTypeProvider>();
    await app.register(requireAuth);

    app.get('/users/me/profile', {
      schema: {
        tags: ['account'],
        summary: 'Ver los datos personales del usuario',
        security: [{ bearerAuth: [] }],
        response: { 200: Type.Ref(ProfileSchema), ...errorResponses(401, 404, 429, 500, 503) },
      },
    }, async (request, reply) => {
      const profile = await deps.profile.getProfile(request.userId);
      if (!profile) return reply.status(404).send(NOT_FOUND);
      return reply.send(profile);
    });

    app.patch('/users/me/profile', {
      schema: {
        tags: ['account'],
        summary: 'Editar los datos personales (solo los campos que se mandan)',
        security: [{ bearerAuth: [] }],
        body: ProfileChangesSchema,
        response: { 200: Type.Ref(ProfileSchema), ...errorResponses(400, 401, 404, 409, 429, 500, 503) },
      },
    }, async (request, reply) => {
      const result = await deps.profile.updateProfile(request.userId, request.body);
      if (result === 'not_found') return reply.status(404).send(NOT_FOUND);
      if (result === 'username_taken') {
        return reply.status(409).send(apiError('USERNAME_TAKEN', 'Ese nombre de usuario ya está en uso'));
      }
      return reply.send(result);
    });
  };
