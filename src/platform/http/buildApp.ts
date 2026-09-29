import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { rateLimitedError, registerErrorHandling } from './errors';

/**
 * Config de ajv (D-70). Por defecto Fastify arma ajv con
 * `removeAdditional: true`: un campo que el schema no declara se BORRA del
 * body o del querystring sin avisar. Con `false`, los schemas que declaran
 * `additionalProperties: false` rechazan el campo de más con 400
 * VALIDATION_ERROR. Los tests de ruta que arman `Fastify()` suelto usan la
 * misma, para probar lo mismo que corre en producción.
 */
export const AJV_OPTIONS = { customOptions: { removeAdditional: false } } satisfies FastifyServerOptions['ajv'];

/**
 * La app HTTP base, sin rutas de negocio: errores con el formato del contrato
 * (`errors.ts`), CORS, rate limit y `/health`. Las
 * rutas de cada módulo las registra `main.ts` (composition root), así
 * `platform/` no conoce el negocio y la app se puede levantar en tests con
 * `inject()`.
 */
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
