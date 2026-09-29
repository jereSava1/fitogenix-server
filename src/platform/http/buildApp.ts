import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { rateLimitedError, registerErrorHandling } from './errors';

/**
 * La app HTTP base, sin rutas de negocio: errores con el formato del contrato
 * (`errors.ts`), CORS, rate limit y `/health`. Las
 * rutas de cada módulo las registra `main.ts` (composition root), así
 * `platform/` no conoce el negocio y la app se puede levantar en tests con
 * `inject()`.
 */
export async function buildApp(options: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify(options);
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
