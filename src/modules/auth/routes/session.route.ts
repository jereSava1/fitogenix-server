// Iniciar sesión (email, Google, Apple), refrescarla y cerrarla (RF-022/023/024/027, ADR-0010).
// Todos los proveedores comparten el handler: cada uno solo define su body y su credencial.

import { Type, type Static, type TObject } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { accessTokenOf, requireAuth } from '../../../platform/http/auth';
import { apiError } from '../../../platform/http/errors';
import {
  addSharedSchemas,
  ApiErrorSchema,
  errorResponses,
  Nullable,
  OpaqueToken,
  PersonName,
  type SameShape,
} from '../../../platform/http/schemas';
import type { Credential, Session } from '../application/ports';
import type { Sessions, SignInOutcome } from '../application/session';
import { AUTH_RATE_LIMIT, Email, sendRateLimited, SUPABASE_RETRY_AFTER_S } from './fields';

export const SessionSchema = Type.Object(
  {
    accessToken: Type.String(),
    refreshToken: Type.String(),
    expiresAt: Type.Integer({ description: 'Segundos desde epoch' }),
    user: Type.Object({ id: Type.String({ format: 'uuid' }), email: Nullable(Type.String()) }),
  },
  { $id: 'Session' },
);
true satisfies SameShape<Static<typeof SessionSchema>, Session>;

const IdToken = OpaqueToken(4096);

interface SignInProvider<B extends TObject> {
  path: string;
  summary: string;
  body: B;
  credential(body: Static<B>): Credential;
  /** El mensaje de 401: cada proveedor falla distinto. */
  invalid: string;
}

const provider = <B extends TObject>(p: SignInProvider<B>) => p as unknown as SignInProvider<TObject>;

/** Un proveedor nuevo es una entrada más acá (y su variante en `Credential`). */
const PROVIDERS = [
  provider({
    path: '/auth/login',
    summary: 'Iniciar sesión con email y contraseña',
    // Sin el mínimo de 8 del registro: hay cuentas creadas con 6.
    body: Type.Object({ email: Email, password: Type.String({ minLength: 1, maxLength: 72 }) }, { additionalProperties: false }),
    credential: (b) => ({ kind: 'password', email: b.email, password: b.password }),
    invalid: 'El email o la contraseña no son correctos.',
  }),
  provider({
    path: '/auth/oauth/google',
    summary: 'Iniciar sesión (o registrarse) con el idToken de Google',
    body: Type.Object({ idToken: IdToken }, { additionalProperties: false }),
    credential: (b) => ({ kind: 'id_token', provider: 'google', idToken: b.idToken }),
    invalid: 'No pudimos verificar tu cuenta de Google. Intentá de nuevo.',
  }),
  provider({
    path: '/auth/oauth/apple',
    summary: 'Iniciar sesión (o registrarse) con el idToken de Apple',
    body: Type.Object(
      {
        idToken: IdToken,
        // El nonce original (sin hashear) si la app lo pidió.
        nonce: Type.Optional(OpaqueToken(128)),
        // Apple da el nombre solo la primera vez y no viene en el token.
        firstName: Type.Optional(PersonName()),
        lastName: Type.Optional(PersonName()),
      },
      { additionalProperties: false },
    ),
    credential: (b) => ({
      kind: 'id_token',
      provider: 'apple',
      idToken: b.idToken,
      nonce: b.nonce,
      names: { firstName: b.firstName ?? null, lastName: b.lastName ?? null },
    }),
    invalid: 'No pudimos verificar tu cuenta de Apple. Intentá de nuevo.',
  }),
];

const EMAIL_NOT_CONFIRMED = apiError('EMAIL_NOT_CONFIRMED', 'Confirmá tu email para iniciar sesión. Revisá tu casilla.');
const INVALID_REFRESH_TOKEN = apiError('INVALID_REFRESH_TOKEN', 'La sesión expiró. Iniciá sesión de nuevo.');

function sendSignIn(reply: FastifyReply, outcome: SignInOutcome, invalid: string) {
  if (outcome === 'invalid_credentials') return reply.status(401).send(apiError('INVALID_CREDENTIALS', invalid));
  if (outcome === 'email_not_confirmed') return reply.status(403).send(EMAIL_NOT_CONFIRMED);
  if (outcome === 'rate_limited') return sendRateLimited(reply, SUPABASE_RETRY_AFTER_S);
  if ('tooManyAttempts' in outcome) return sendRateLimited(reply, outcome.tooManyAttempts);
  return reply.send(outcome);
}

export const sessionSharedSchemas = [ApiErrorSchema, SessionSchema];

export const sessionRoutes = (deps: { sessions: Sessions }): FastifyPluginAsync =>
  async (instance) => {
    addSharedSchemas(instance, sessionSharedSchemas);
    const app = instance.withTypeProvider<TypeBoxTypeProvider>();

    for (const p of PROVIDERS) {
      app.post(p.path, {
        config: { rateLimit: AUTH_RATE_LIMIT },
        schema: {
          tags: ['auth'],
          summary: p.summary,
          body: p.body,
          response: { 200: Type.Ref(SessionSchema), ...errorResponses(400, 401, 403, 429, 500, 503) },
        },
      }, async (request, reply) =>
        sendSignIn(reply, await deps.sessions.signIn(p.credential(request.body), request.ip), p.invalid));
    }

    app.post('/auth/refresh', {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Renovar la sesión con el refresh token',
        body: Type.Object({ refreshToken: OpaqueToken(512) }, { additionalProperties: false }),
        response: { 200: Type.Ref(SessionSchema), ...errorResponses(400, 401, 429, 500, 503) },
      },
    }, async (request, reply) => {
      const result = await deps.sessions.refresh(request.body.refreshToken, request.ip);
      if (result === 'invalid_refresh_token') return reply.status(401).send(INVALID_REFRESH_TOKEN);
      if (result === 'rate_limited') return sendRateLimited(reply, SUPABASE_RETRY_AFTER_S);
      return reply.send(result);
    });

    // En su propio contexto: requireAuth vale solo para esta ruta.
    await app.register(async (scoped) => {
      await scoped.register(requireAuth);
      scoped.post('/auth/logout', {
        config: { rateLimit: AUTH_RATE_LIMIT },
        schema: {
          tags: ['auth'],
          summary: 'Cerrar la sesión de este dispositivo',
          security: [{ bearerAuth: [] }],
          response: { 204: Type.Null(), ...errorResponses(401, 429, 500, 503) },
        },
      }, async (request, reply) => {
        await deps.sessions.signOut(accessTokenOf(request)!);
        return reply.status(204).send();
      });
    });
  };
