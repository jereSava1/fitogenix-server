// API pública de feedback: comentarios sobre la app y reportes de productos (F-07).

import type { FastifyInstance } from 'fastify';
import { makeFeedback } from './application/feedback';
import { supabaseFeedbackRepository } from './infrastructure/supabaseFeedbackRepository';
import { addSharedSchemas } from '../../platform/http/schemas';
import { feedbackRoutes, feedbackSharedSchemas } from './routes/feedback.route';

export async function registerFeedback(app: FastifyInstance): Promise<void> {
  // En la raíz, para que el OpenAPI los tenga como componentes (ADR-0011).
  addSharedSchemas(app, feedbackSharedSchemas);
  await app.register(feedbackRoutes({ feedback: makeFeedback(supabaseFeedbackRepository) }));
}
