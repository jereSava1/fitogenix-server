// POST /v1/feedback y /v1/products/:productId/reports (RF-043, RF-044): con o sin sesión
// (D-21, D-26). Con token válido se guarda el usuario; si no, queda anónimo.

import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { optionalAuth } from '../../../platform/http/auth';
import { apiError } from '../../../platform/http/errors';
import { addSharedSchemas, ApiErrorSchema, errorResponses, OkSchema, StringEnum } from '../../../platform/http/schemas';
import type { FeedbackService } from '../application/feedback';
import { PLATFORMS, REPORT_TYPES } from '../application/ports';

/** D-48: 5 por minuto por IP en cada ruta (el general es 60). */
export const FEEDBACK_RATE_LIMIT = { max: 5, timeWindow: '1 minute' };

const Message = Type.String({ maxLength: 2000 });

const FeedbackBody = Type.Object(
  {
    message: Type.String({ minLength: 1, maxLength: 2000, pattern: '\\S' }),
    appVersion: Type.Optional(Type.String({ maxLength: 32, pattern: '^[0-9A-Za-z.+-]+$' })),
    platform: Type.Optional(StringEnum(PLATFORMS)),
  },
  { additionalProperties: false },
);

const ReportBody = Type.Object(
  { type: StringEnum(REPORT_TYPES), message: Type.Optional(Message) },
  { additionalProperties: false },
);

export const feedbackSharedSchemas = [ApiErrorSchema, OkSchema];

export const feedbackRoutes = (deps: { feedback: FeedbackService }): FastifyPluginAsync =>
  async (instance) => {
    addSharedSchemas(instance, feedbackSharedSchemas);
    const app = instance.withTypeProvider<TypeBoxTypeProvider>();

    app.post('/feedback', {
      config: { rateLimit: FEEDBACK_RATE_LIMIT },
      schema: {
        tags: ['feedback'],
        summary: 'Mandar un comentario sobre la app (con o sin sesión)',
        body: FeedbackBody,
        response: { 202: Type.Ref(OkSchema), ...errorResponses(400, 429, 500, 503) },
      },
    }, async (request, reply) => {
      await deps.feedback.send({ userId: await optionalAuth(request), ...request.body });
      return reply.status(202).send({ ok: true });
    });

    app.post('/products/:productId/reports', {
      config: { rateLimit: FEEDBACK_RATE_LIMIT },
      schema: {
        tags: ['feedback'],
        summary: 'Reportar un problema con los datos de un producto (con o sin sesión)',
        params: Type.Object({ productId: Type.String({ format: 'uuid' }) }),
        body: ReportBody,
        response: { 202: Type.Ref(OkSchema), ...errorResponses(400, 404, 429, 500, 503) },
      },
    }, async (request, reply) => {
      const result = await deps.feedback.report({
        userId: await optionalAuth(request),
        productId: request.params.productId,
        ...request.body,
      });
      if (result === 'product_not_found') {
        return reply.status(404).send(apiError('NOT_FOUND', 'Producto no encontrado en el catálogo'));
      }
      return reply.status(202).send({ ok: true });
    });
  };
