import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

/**
 * La app HTTP base, sin rutas de negocio: CORS, rate limit y `/health`. Las
 * rutas de cada módulo las registra `main.ts` (composition root), así
 * `platform/` no conoce el negocio y la app se puede levantar en tests con
 * `inject()`.
 */
export async function buildApp(options: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify(options);

  await app.register(cors, {
    origin: true,
  });

  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Demasiadas solicitudes. Intentá de nuevo en un momento.',
    }),
  });

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  return app;
}
