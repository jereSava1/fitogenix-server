import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { rateLimitedError, registerErrorHandling } from './errors';

/** Fastify borra por defecto los campos que el schema no declara; con esto, los schemas
 *  con `additionalProperties: false` responden 400 (D-70). Los tests de ruta usan la misma. */
export const AJV_OPTIONS = { customOptions: { removeAdditional: false } } satisfies FastifyServerOptions['ajv'];

/** La app base sin rutas de negocio: errores, CORS, rate limit y `/health`. */
export async function buildApp(options: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ ...options, ajv: AJV_OPTIONS });
  registerErrorHandling(app);

  await app.register(cors, {
    origin: true,
  });

  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    // El cuerpo `{ error, code: 'RATE_LIMITED' }` lo arma el manejador de
    // errores; acá solo hace falta el status (429).
    errorResponseBuilder: (_request, context) => rateLimitedError(context.statusCode),
  });

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  return app;
}
