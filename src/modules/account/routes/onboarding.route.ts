// POST /v1/users/me/onboarding: las respuestas del onboarding del usuario del token (RF-048).
// Síntomas, dietas o alergias sin consentimiento → 400 (RNF-S10, D-83).

import { Type, type Static } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../../../platform/http/auth';
import { apiError } from '../../../platform/http/errors';
import {
  addSharedSchemas,
  ApiErrorSchema,
  errorResponses,
  OkSchema,
  StringEnum,
  type SameShape,
} from '../../../platform/http/schemas';
import type { OnboardingService } from '../application/onboarding';
import { ALLERGIES, AVOID, DIETS, GOALS, SOURCES, SYMPTOMS, type OnboardingAnswers } from '../application/ports';

/** Lista sin repetidos, como mucho una vez cada opción. */
function Choices<T extends string>(values: Record<T, true>) {
  return Type.Array(StringEnum(values), { uniqueItems: true, maxItems: Object.keys(values).length });
}

export const OnboardingAnswersSchema = Type.Object(
  {
    goals: Choices(GOALS),
    symptoms: Choices(SYMPTOMS),
    diets: Choices(DIETS),
    allergies: Choices(ALLERGIES),
    avoid: Choices(AVOID),
    source: Type.Unsafe<keyof typeof SOURCES | null>({ type: ['string', 'null'], enum: [...Object.keys(SOURCES), null] }),
  },
  { $id: 'OnboardingAnswers', additionalProperties: false },
);
true satisfies SameShape<Static<typeof OnboardingAnswersSchema>, OnboardingAnswers>;

const OnboardingBody = Type.Object(
  {
    answers: Type.Ref(OnboardingAnswersSchema),
    consent: Type.Optional(
      Type.Object(
        {
          // `const` sin `type`: ajv no convierte "true" ni 1 en true (consentimiento explícito).
          healthData: Type.Unsafe<true>({ const: true }),
          textVersion: Type.String({ minLength: 1, maxLength: 40, pattern: '^[0-9A-Za-z._-]+$' }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

const CONSENT_REQUIRED = apiError(
  'VALIDATION_ERROR',
  'Para guardar síntomas, dietas o alergias necesitamos tu consentimiento.',
);

export const onboardingSharedSchemas = [ApiErrorSchema, OkSchema, OnboardingAnswersSchema];

export const onboardingRoutes = (deps: { onboarding: OnboardingService }): FastifyPluginAsync =>
  async (instance) => {
    addSharedSchemas(instance, onboardingSharedSchemas);
    const app = instance.withTypeProvider<TypeBoxTypeProvider>();
    await app.register(requireAuth);

    app.post('/users/me/onboarding', {
      schema: {
        tags: ['account'],
        summary: 'Guardar las respuestas del onboarding (datos de salud solo con consentimiento)',
        security: [{ bearerAuth: [] }],
        body: OnboardingBody,
        response: { 200: Type.Ref(OkSchema), ...errorResponses(400, 401, 429, 500, 503) },
      },
    }, async (request, reply) => {
      const { answers, consent } = request.body;
      const result = await deps.onboarding.save(request.userId, answers, consent);
      if (result === 'consent_required') return reply.status(400).send(CONSENT_REQUIRED);
      return reply.send({ ok: true });
    });
  };
